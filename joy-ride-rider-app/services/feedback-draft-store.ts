import type { Store } from "./rider-feedback-core";
import { FeedbackError } from "./rider-feedback-core";
export type KeyStore = {
  read: Store["read"];
  write: Store["write"];
  remove: Store["remove"];
};
// Small JSON-encoded chunks stay below native SecureStore item-size limits even
// for Unicode comments. The index is committed last; partial writes are never
// treated as a durable submission. This store is for local drafts, not tokens.
export function createDraftStore(
  storage: KeyStore,
  revision = () =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`,
): Store {
  async function index(
    key: string,
  ): Promise<{ revision: string; count: number } | null> {
    const raw = await storage.read(key);
    if (raw === null) return null;
    try {
      const v: unknown = JSON.parse(raw);
      if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error();
      const i = v as Record<string, unknown>;
      if (
        typeof i.revision !== "string" ||
        !/^[a-z0-9-]{1,64}$/.test(i.revision) ||
        typeof i.count !== "number" ||
        !Number.isInteger(i.count) ||
        i.count < 1 ||
        i.count > 32
      )
        throw new Error();
      return { revision: i.revision, count: i.count };
    } catch {
      throw new FeedbackError(
        "Saved feedback index is unreadable. It has not been overwritten.",
      );
    }
  }
  const chunkKey = (key: string, rev: string, n: number) =>
    `${key}-${rev}-${n}`;
  async function cleanup(key: string, i: { revision: string; count: number }) {
    for (let n = 0; n < i.count; n++)
      await storage.remove(chunkKey(key, i.revision, n));
  }
  return {
    async read(key) {
      const i = await index(key);
      if (!i) return null;
      const chunks: string[] = [];
      for (let n = 0; n < i.count; n++) {
        const raw = await storage.read(chunkKey(key, i.revision, n));
        if (raw === null)
          throw new FeedbackError(
            "Saved feedback is incomplete. Refresh or contact Admin.",
          );
        try {
          const v: unknown = JSON.parse(raw);
          if (typeof v !== "string" || v.length > 256) throw new Error();
          chunks.push(v);
        } catch {
          throw new FeedbackError(
            "Saved feedback is unreadable. It has not been overwritten.",
          );
        }
      }
      return chunks.join("");
    },
    async write(key, value) {
      if (value.length > 8192)
        throw new FeedbackError("Feedback is too long to save safely.");
      const old = await index(key);
      if (old)
        throw new FeedbackError(
          "Feedback is already saved. Refresh and retry it.",
        );
      const rev = revision();
      if (!/^[a-z0-9-]{1,64}$/.test(rev))
        throw new FeedbackError("Could not prepare feedback storage.");
      const count = Math.max(1, Math.ceil(value.length / 256));
      try {
        for (let n = 0; n < count; n++)
          await storage.write(
            chunkKey(key, rev, n),
            JSON.stringify(value.slice(n * 256, (n + 1) * 256)),
          );
        await storage.write(key, JSON.stringify({ revision: rev, count }));
      } catch (e) {
        // If index write actually succeeded but its completion was lost, retain
        // the chunks. Otherwise remove best-effort partial uncommitted chunks.
        try {
          if (!(await index(key))) await cleanup(key, { revision: rev, count });
        } catch {
          /* Retain on uncertain storage state. */
        }
        throw e;
      }
    },
    async remove(key) {
      const i = await index(key);
      if (!i) return;
      await storage.remove(key); // Called only after server confirmation.
      try {
        await cleanup(key, i);
      } catch {
        /* Confirmation is already durable on server. */
      }
    },
  };
}
