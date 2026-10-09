import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDatabaseSsl, getConflictingSslParameters, readCertificate, sanitizeDatabaseUrl } from '../src/config.js'

test('readCertificate decodes base64 certificates and escaped newlines', () => {
  const certificate = '-----BEGIN CERTIFICATE-----\nca\n-----END CERTIFICATE-----'
  assert.equal(readCertificate('', Buffer.from(certificate).toString('base64')), certificate)
  assert.equal(readCertificate(certificate.replaceAll('\n', '\\n')), certificate)
})

test('detects and removes conflicting SSL parameters', () => {
  const databaseUrl = 'postgresql://user:pass@example.com:5432/db?sslmode=require&sslrootcert=%2Ftmp%2Fca.crt&application_name=loyaltea'
  assert.deepEqual(getConflictingSslParameters(databaseUrl), ['sslmode', 'sslrootcert'])
  const sanitized = sanitizeDatabaseUrl(databaseUrl)
  assert.equal(new URL(sanitized).searchParams.get('sslmode'), null)
  assert.equal(new URL(sanitized).searchParams.get('sslrootcert'), null)
  assert.equal(new URL(sanitized).searchParams.get('application_name'), 'loyaltea')
})

test('buildDatabaseSsl verifies the supplied CA and endpoint hostname', () => {
  const ssl = buildDatabaseSsl('postgresql://user:pass@pooler.supabase.com:5432/db', 'CA')
  assert.deepEqual(ssl, { ca: 'CA', rejectUnauthorized: true, servername: 'pooler.supabase.com' })
})

test('production verification cannot be represented by a false flag', () => {
  assert.equal(buildDatabaseSsl('postgresql://user:pass@pooler.supabase.com:5432/db', 'CA').rejectUnauthorized, true)
})
