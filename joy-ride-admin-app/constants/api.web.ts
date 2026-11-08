const production = process.env.EXPO_PUBLIC_JOYRIDE_WEB_PRODUCTION === "1";
const test = process.env.EXPO_PUBLIC_JOYRIDE_WEB_SAFETY_TEST === "1";
const local = process.env.EXPO_PUBLIC_JOYRIDE_WEB_LOCAL === "1";
const api = process.env.EXPO_PUBLIC_API_BASE_URL;
if (
  Number(production) + Number(test) + Number(local) !== 1 ||
  !api ||
  (production
    ? Boolean(process.env.EXPO_PUBLIC_JOYRIDE_VARIANT) ||
      !/^https:\/\/explore-png-api[.]onrender[.]com$/.test(api)
    : test
      ? process.env.EXPO_PUBLIC_JOYRIDE_VARIANT !== "safety-test" ||
        !/^https:\/\/joyride-safety-test-api[.]onrender[.]com$/.test(api)
      : process.env.EXPO_PUBLIC_JOYRIDE_VARIANT !== "local" ||
        !/^http:\/\/localhost:3000$/.test(api))
) {
  throw new Error("Select one explicit Admin browser environment and its exact API.");
}
export const API_BASE_URL: string = api;
