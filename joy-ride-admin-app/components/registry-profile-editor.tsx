import { adminFetch } from '@/services/admin-auth';
import type { RegistryDriver, RegistryVehicle } from '@/services/fleet-registry';
import React, { useRef, useState } from 'react';
import { Modal, ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';

type Field = { key: string; label: string; kind?: 'date' | 'number'; required?: boolean };
const driverFields: Field[] = [
  { key: 'fullName', label: 'Full name', required: true },
  { key: 'phone', label: 'Phone number', required: true },
  { key: 'email', label: 'Email' },
  { key: 'licenseNumber', label: 'Licence number' },
  { key: 'licenseClass', label: 'Licence class' },
  { key: 'licenseIssuedAt', label: 'Licence issued', kind: 'date' },
  { key: 'licenseExpiresAt', label: 'Licence expires', kind: 'date' },
  { key: 'dateOfBirth', label: 'Date of birth', kind: 'date' },
  { key: 'emergencyContactName', label: 'Emergency contact name' },
  { key: 'emergencyContactPhone', label: 'Emergency contact phone' },
  { key: 'emergencyContactRelationship', label: 'Emergency contact relationship' },
];
const vehicleFields: Field[] = [
  { key: 'plateNumber', label: 'Plate number', required: true },
  { key: 'make', label: 'Make' }, { key: 'model', label: 'Model' },
  { key: 'year', label: 'Year', kind: 'number' },
  { key: 'color', label: 'Colour' },
  { key: 'seatCount', label: 'Seat count', kind: 'number' },
  { key: 'chassisNumber', label: 'Chassis number' },
  { key: 'registrationNumber', label: 'Registration number' },
  { key: 'registrationExpiresAt', label: 'Registration expires', kind: 'date' },
];

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function buildProfilePatch(fields: Field[], values: Record<string, string>, initial: Record<string, string>) {
  const patch: Record<string, string | number> = {};
  for (const field of fields) {
    const value = values[field.key].trim();
    if (field.required && !value) throw new Error(`${field.label} is required.`);
    if (value === initial[field.key]) continue;
    if (!value) throw new Error(`${field.label} cannot be cleared here. Enter the corrected value or cancel.`);
    if (field.kind === 'date' && !validDate(value)) throw new Error(`${field.label}: enter a real date as YYYY-MM-DD.`);
    if (field.key === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error('Enter a valid email address.');
    if (field.kind === 'number') {
      const number = Number(value);
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < (field.key === 'year' ? 1900 : 1)) {
        throw new Error(`${field.label}: enter a whole number of at least ${field.key === 'year' ? 1900 : 1}.`);
      }
      patch[field.key] = number;
    } else patch[field.key] = value;
  }
  if (values.licenseIssuedAt && values.licenseExpiresAt && values.licenseIssuedAt > values.licenseExpiresAt) {
    throw new Error('Licence expiry must not be before its issue date.');
  }
  return patch;
}

type Props = {
  kind: 'driver' | 'vehicle';
  record: RegistryDriver | RegistryVehicle;
  onClose: () => void;
  onSaved: () => void;
};

export default function RegistryProfileEditor({ kind, record, onClose, onSaved }: Props) {
  const fields = kind === 'driver' ? driverFields : vehicleFields;
  const [initial] = useState<Record<string, string>>(() => Object.fromEntries(fields.map(field => {
    const raw = (record as unknown as Record<string, unknown>)[field.key];
    const text = raw == null ? '' : String(raw);
    return [field.key, field.kind === 'date' ? text.slice(0, 10) : text];
  })));
  const [values, setValues] = useState(initial);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const close = () => { if (!savingRef.current) onClose(); };

  async function save() {
    if (savingRef.current) return;
    let patch: Record<string, string | number>;
    try { patch = buildProfilePatch(fields, values, initial); }
    catch (error) { setError(error instanceof Error ? error.message : 'Check the form fields.'); return; }
    if (!Object.keys(patch).length) { setError('No changes to save. Use Cancel to close.'); return; }
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const response = await adminFetch(`/${kind === 'driver' ? 'drivers' : 'vehicles'}/${encodeURIComponent(record.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        setError(response.status === 401 || response.status === 403
          ? 'Only a signed-in super administrator can save profile changes.'
          : response.status === 404 ? 'This record no longer exists. Close and refresh the registry.'
          : response.status === 409 ? 'A value conflicts with an existing record. Check the phone, plate or registration details.'
          : `Changes could not be confirmed (HTTP ${response.status}). Check the fields; close and refresh before retrying.`);
        return;
      }
      const result: unknown = await response.json().catch(() => null);
      if (!result || typeof result !== 'object' || !('id' in result) || result.id !== record.id) {
        setError('The server accepted the request but did not confirm the record. Close and refresh before retrying.');
        return;
      }
      onSaved();
    } catch {
      setError('Save could not be confirmed. Close and refresh the registry before retrying.');
    } finally { savingRef.current = false; setSaving(false); }
  }

  return <Modal visible animationType="slide" onRequestClose={close}>
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{kind === 'driver' ? 'Edit Driver' : 'Edit Vehicle'}</Text>
      <Text style={styles.hint}>Correct the details below. Dates use YYYY-MM-DD.</Text>
      {kind === 'vehicle' && 'driver' in record ? <Text style={styles.hint}>Linked driver: {record.driver.fullName}</Text> : null}
      {fields.map(field => <View key={field.key} style={styles.field}>
        <Text style={styles.label}>{field.label}{field.required ? ' *' : ''}</Text>
        <TextInput accessibilityLabel={field.label} style={styles.input} value={values[field.key]}
          editable={!saving} autoCapitalize={field.key === 'email' ? 'none' : 'sentences'}
          keyboardType={field.kind === 'number' ? 'number-pad' : field.key === 'email' ? 'email-address' : 'default'}
          placeholder={field.kind === 'date' ? 'YYYY-MM-DD' : undefined}
          onChangeText={value => setValues(current => ({ ...current, [field.key]: value }))} />
      </View>)}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <TouchableOpacity accessibilityRole="button" disabled={saving} style={styles.save} onPress={() => void save()}>
        <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" disabled={saving} style={styles.cancel} onPress={close}>
        <Text style={styles.label}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  </Modal>;
}
const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 56, paddingBottom: 60, backgroundColor: '#f8fafc' },
  title: { fontSize: 26, fontWeight: '800', color: '#0f172a', marginBottom: 12 },
  hint: { color: '#475569', marginBottom: 16 },
  field: { marginBottom: 14 }, label: { color: '#334155', fontWeight: '700', marginBottom: 6 },
  input: { padding: 12, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, color: '#0f172a', backgroundColor: '#fff' },
  error: { color: '#b91c1c', marginVertical: 12 },
  save: { backgroundColor: '#2563eb', padding: 16, borderRadius: 10, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '800' },
  cancel: { padding: 16, alignItems: 'center', marginTop: 8 },
});
