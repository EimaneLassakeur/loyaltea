import test from 'node:test'
import assert from 'node:assert/strict'
import { createZipArchive, generateApplePassBuffer, generateGoogleWalletPass } from '../src/wallet/walletService.js'

test('createZipArchive produces a valid ZIP archive buffer with PK signatures', () => {
  const files = [
    { name: 'hello.txt', content: 'Hello Loyaltea' },
    { name: 'sub/data.json', content: JSON.stringify({ ok: true }) },
  ]
  const zipBuffer = createZipArchive(files)

  assert.ok(Buffer.isBuffer(zipBuffer), 'Output must be a Node.js Buffer')
  assert.ok(zipBuffer.length > 50, 'ZIP buffer must contain data')

  // Standard ZIP file signature: 0x04034b50 (Little Endian: PK\x03\x04)
  assert.equal(zipBuffer[0], 0x50, 'Byte 0 must be P')
  assert.equal(zipBuffer[1], 0x4b, 'Byte 1 must be K')
  assert.equal(zipBuffer[2], 0x03, 'Byte 2 must be 0x03')
  assert.equal(zipBuffer[3], 0x04, 'Byte 3 must be 0x04')
})

test('generateApplePassBuffer builds valid storeCard pass structure with customer QR barcode', () => {
  const mockPassData = {
    membership_id: 'mem-uuid-1234',
    customer_name: 'Amine Benali',
    secure_token: 'sec-tok-987654321',
    business_name: 'Artisan Cafe',
    business_slug: 'artisan-cafe',
    program_name: 'Artisan Rewards',
    model: 'POINTS',
    balance: 350,
    activeReward: {
      id: 'rew-1',
      name: 'Free Espresso & Croissant',
      required_points: 300,
    },
  }

  const { buffer, passJson, filename } = generateApplePassBuffer(mockPassData)

  // Validate ZIP buffer
  assert.ok(Buffer.isBuffer(buffer))
  assert.equal(buffer[0], 0x50)
  assert.equal(buffer[1], 0x4b)
  assert.equal(filename, 'artisan-cafe-card.pkpass')

  // Validate Apple Pass JSON schema
  assert.equal(passJson.formatVersion, 1)
  assert.equal(passJson.serialNumber, 'mem-uuid-1234')
  assert.equal(passJson.organizationName, 'Artisan Cafe')
  assert.equal(passJson.description, 'Artisan Cafe Loyalty Card')

  // Validate Barcode matches cashier scanner requirements
  assert.ok(Array.isArray(passJson.barcodes))
  assert.equal(passJson.barcodes[0].format, 'PKBarcodeFormatQR')
  assert.equal(passJson.barcodes[0].message, 'sec-tok-987654321')

  // Validate fields layout
  assert.equal(passJson.storeCard.primaryFields[0].key, 'balance')
  assert.equal(passJson.storeCard.primaryFields[0].value, '350')
  assert.equal(passJson.storeCard.primaryFields[0].label, 'POINTS')
  assert.equal(passJson.storeCard.secondaryFields[0].value, 'Amine Benali')
  assert.equal(passJson.storeCard.auxiliaryFields[0].value, 'Free Espresso & Croissant')
})

test('generateApplePassBuffer handles STAMPS model correctly', () => {
  const mockPassData = {
    membership_id: 'mem-stamps-5678',
    customer_name: 'Sarah K.',
    secure_token: 'sec-stamp-token',
    business_name: 'Green Matcha Bar',
    business_slug: 'green-matcha',
    program_name: 'Matcha Stamps',
    model: 'STAMPS',
    balance: 7,
    activeReward: {
      id: 'rew-2',
      name: 'Free Special Matcha',
      required_stamps: 10,
    },
  }

  const { passJson } = generateApplePassBuffer(mockPassData)
  assert.equal(passJson.storeCard.primaryFields[0].label, 'STAMPS')
  assert.equal(passJson.storeCard.primaryFields[0].value, '7')
})

test('generateGoogleWalletPass creates valid LoyaltyClass and LoyaltyObject with QR barcode', () => {
  const mockPassData = {
    membership_id: 'mem-goog-001',
    customer_name: 'Karim Z.',
    secure_token: 'token-qr-customer-99',
    business_name: 'Tea Oasis',
    business_slug: 'tea-oasis',
    program_id: 'prog-uuid-77',
    program_name: 'Oasis Club',
    model: 'POINTS',
    balance: 520,
    activeReward: {
      id: 'rew-3',
      name: '10% Discount on Tea Boxes',
    },
  }

  const result = generateGoogleWalletPass(mockPassData)

  assert.ok(result.loyaltyClass, 'Must contain loyaltyClass')
  assert.ok(result.loyaltyObject, 'Must contain loyaltyObject')

  // Validate Class ID and Object ID
  assert.ok(result.classId.includes('prog_uuid_77'))
  assert.ok(result.objectId.includes('membership_mem_goog_001'))

  // Validate LoyaltyObject properties
  assert.equal(result.loyaltyObject.state, 'ACTIVE')
  assert.equal(result.loyaltyObject.accountId, 'token-qr-customer-99')
  assert.equal(result.loyaltyObject.accountName, 'Karim Z.')
  assert.equal(result.loyaltyObject.barcode.type, 'QR_CODE')
  assert.equal(result.loyaltyObject.barcode.value, 'token-qr-customer-99')
  assert.equal(result.loyaltyObject.loyaltyPoints.balance.string, '520')
  assert.equal(result.loyaltyObject.loyaltyPoints.label, 'Points')
  assert.equal(result.loyaltyObject.secondaryLoyaltyPoints.balance.string, '10% Discount on Tea Boxes')
})
