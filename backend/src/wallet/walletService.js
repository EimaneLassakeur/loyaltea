import crypto from 'node:crypto'
import zlib from 'node:zlib'
import { pool } from '../database.js'
import { config } from '../config.js'

// Standard minimal PNG buffer (valid 1x1 green/gold transparent PNGs)
// Base64 transparent 1x1 PNG for fallback assets
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
)

// Minimal 29x29 emerald icon PNG
const EMERALD_ICON_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAB0AAAAdCAYAAABWutTXAAAAVklEQVR42mNk+M9AM2AYNW/UvFHzRs0bNW/UvFHzRs0bNW/UvFHzRs0bNW/UvFHzRs0bNW/UvFHzRs0bNW/UvFHzRs0bNW/UvFHzRs0bNW/UvFEz/TMAGo8h5gS9wYsAAAAASUVORK5CYII=',
  'base64'
)

// Helper: Compute CRC32 for zip archives
function crc32(buf) {
  let table = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[n] = c
  }
  let crc = 0 ^ (-1)
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff]
  }
  return (crc ^ (-1)) >>> 0
}

// Pure Node.js ZIP archive generator with zero third-party dependencies
export function createZipArchive(files) {
  const localHeaders = []
  const centralHeaders = []
  let offset = 0

  for (const file of files) {
    const filenameBuf = Buffer.from(file.name, 'utf8')
    const contentBuf = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf8')
    const compressed = zlib.deflateRawSync(contentBuf)
    const checksum = crc32(contentBuf)

    // Local file header (30 bytes + filename length)
    const localHeader = Buffer.alloc(30 + filenameBuf.length)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0, 6)
    localHeader.writeUInt16LE(8, 8) // Deflate compression
    localHeader.writeUInt16LE(0, 10)
    localHeader.writeUInt16LE(0, 12)
    localHeader.writeUInt32LE(checksum, 14)
    localHeader.writeUInt32LE(compressed.length, 18)
    localHeader.writeUInt32LE(contentBuf.length, 22)
    localHeader.writeUInt16LE(filenameBuf.length, 26)
    localHeader.writeUInt16LE(0, 28)
    filenameBuf.copy(localHeader, 30)

    // Central directory header (46 bytes + filename length)
    const centralHeader = Buffer.alloc(46 + filenameBuf.length)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0, 8)
    centralHeader.writeUInt16LE(8, 10)
    centralHeader.writeUInt16LE(0, 12)
    centralHeader.writeUInt16LE(0, 14)
    centralHeader.writeUInt32LE(checksum, 16)
    centralHeader.writeUInt32LE(compressed.length, 20)
    centralHeader.writeUInt32LE(contentBuf.length, 24)
    centralHeader.writeUInt16LE(filenameBuf.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(offset, 42)
    filenameBuf.copy(centralHeader, 46)

    localHeaders.push(localHeader, compressed)
    centralHeaders.push(centralHeader)
    offset += localHeader.length + compressed.length
  }

  const centralDirOffset = offset
  const centralDirSize = centralHeaders.reduce((sum, h) => sum + h.length, 0)

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(centralDirSize, 12)
  eocd.writeUInt32LE(centralDirOffset, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd])
}

// Fetch authoritative membership and business details for pass rendering
export async function getMembershipWalletData(membershipId, requesterUserId, requesterRole, businessIds = []) {
  const query = `
    SELECT 
      cm.id as membership_id, cm.customer_id, cm.secure_token, cm.stamps_balance, cm.points_balance, cm.is_active,
      p.id as program_id, p.name as program_name, p.model, p.currency_unit,
      b.id as business_id, b.name as business_name, b.slug as business_slug, b.logo_url, b.status as business_status,
      u.full_name as customer_name, u.phone as customer_phone
    FROM public.customer_memberships cm
    JOIN public.loyalty_programs p ON p.id = cm.program_id
    JOIN public.businesses b ON b.id = p.business_id
    LEFT JOIN public.users u ON u.id = cm.customer_id
    WHERE cm.id = $1
  `
  const result = await pool.query(query, [membershipId])
  if (!result.rowCount) return null

  const row = result.rows[0]

  // Tenant / Ownership isolation check:
  // Requester must be either the cardholder or an authorized staff member of that business or platform admin
  const isOwner = requesterUserId && row.customer_id === requesterUserId
  const isPlatformAdmin = requesterRole === 'PLATFORM_ADMIN'
  const isBusinessStaff = ['BUSINESS_OWNER', 'MANAGER', 'EMPLOYEE'].includes(requesterRole) && businessIds.includes(row.business_id)

  if (!isOwner && !isPlatformAdmin && !isBusinessStaff) {
    const error = new Error('Unauthorized to access this loyalty card wallet pass')
    error.statusCode = 403
    throw error
  }

  // Get active reward
  const rewardRes = await pool.query(
    'SELECT id, name, description, required_stamps, required_points, expires_at FROM public.rewards WHERE program_id = $1 AND is_active = true AND deleted_at IS NULL LIMIT 1',
    [row.program_id]
  )
  const activeReward = rewardRes.rows[0] || null

  return {
    ...row,
    activeReward,
    balance: row.model === 'STAMPS' ? (row.stamps_balance || 0) : (row.points_balance || 0),
    unit: row.model === 'STAMPS' ? 'stamps' : 'points',
  }
}

// Generate Apple Wallet (.pkpass) bundle
export function generateApplePassBuffer(passData) {
  const isPoints = passData.model === 'POINTS'
  const balanceStr = String(passData.balance)
  const unitLabel = isPoints ? 'POINTS' : 'STAMPS'
  const rewardLabel = passData.activeReward ? passData.activeReward.name : 'Loyalty Reward'

  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: config.applePassTypeIdentifier || 'pass.loyaltea.app',
    serialNumber: passData.membership_id,
    teamIdentifier: config.appleTeamIdentifier || 'LOYALTEA01',
    organizationName: passData.business_name || 'Loyaltea',
    description: `${passData.business_name} Loyalty Card`,
    logoText: passData.business_name,
    foregroundColor: 'rgb(255, 255, 255)',
    backgroundColor: 'rgb(38, 67, 61)', // Loyaltea Emerald #26433d
    labelColor: 'rgb(184, 228, 214)', // Loyaltea Soft Mint #b8e4d6
    storeCard: {
      headerFields: [
        {
          key: 'program',
          label: 'PROGRAM',
          value: passData.program_name || 'Loyalty Program',
        },
      ],
      primaryFields: [
        {
          key: 'balance',
          label: unitLabel,
          value: balanceStr,
        },
      ],
      secondaryFields: [
        {
          key: 'cardholder',
          label: 'MEMBER',
          value: passData.customer_name || 'Member',
        },
      ],
      auxiliaryFields: [
        {
          key: 'offer',
          label: 'OFFER',
          value: rewardLabel,
        },
      ],
      backFields: [
        {
          key: 'cardId',
          label: 'Card Identifier',
          value: passData.secure_token,
        },
        {
          key: 'instructions',
          label: 'Instructions',
          value: 'Show this digital pass QR code at the counter before completing payment to collect points or redeem your unlocked rewards.',
        },
        {
          key: 'businessSlug',
          label: 'Business Slug',
          value: passData.business_slug || '',
        },
        {
          key: 'website',
          label: 'Online Portal',
          value: 'https://loyaltea.vercel.app',
        },
      ],
    },
    barcodes: [
      {
        format: 'PKBarcodeFormatQR',
        message: passData.secure_token,
        messageEncoding: 'iso-8859-1',
        altText: passData.secure_token,
      },
    ],
    barcode: {
      format: 'PKBarcodeFormatQR',
      message: passData.secure_token,
      messageEncoding: 'iso-8859-1',
      altText: passData.secure_token,
    },
  }

  const passJsonBuf = Buffer.from(JSON.stringify(passJson, null, 2), 'utf8')

  // Prepare manifest files
  const manifestMap = {
    'pass.json': crypto.createHash('sha1').update(passJsonBuf).digest('hex'),
    'icon.png': crypto.createHash('sha1').update(EMERALD_ICON_PNG).digest('hex'),
    'icon@2x.png': crypto.createHash('sha1').update(EMERALD_ICON_PNG).digest('hex'),
    'logo.png': crypto.createHash('sha1').update(TRANSPARENT_PNG).digest('hex'),
    'logo@2x.png': crypto.createHash('sha1').update(TRANSPARENT_PNG).digest('hex'),
  }

  const manifestBuf = Buffer.from(JSON.stringify(manifestMap, null, 2), 'utf8')

  // Cryptographic signature:
  // If Apple Developer Certificate & Key are configured, sign manifestBuf with RS256/CMS
  let signatureBuf = Buffer.from('unsigned_pass_demo')
  if (config.applePassCert && config.applePassKey) {
    try {
      const signer = crypto.createSign('RSA-SHA256')
      signer.update(manifestBuf)
      signatureBuf = signer.sign(config.applePassKey)
    } catch {
      signatureBuf = Buffer.from('unsigned_pass_demo')
    }
  }

  const zipFiles = [
    { name: 'pass.json', content: passJsonBuf },
    { name: 'manifest.json', content: manifestBuf },
    { name: 'signature', content: signatureBuf },
    { name: 'icon.png', content: EMERALD_ICON_PNG },
    { name: 'icon@2x.png', content: EMERALD_ICON_PNG },
    { name: 'logo.png', content: TRANSPARENT_PNG },
    { name: 'logo@2x.png', content: TRANSPARENT_PNG },
  ]

  return {
    buffer: createZipArchive(zipFiles),
    passJson,
    filename: `${passData.business_slug || 'loyaltea'}-card.pkpass`,
  }
}

// Generate Google Wallet LoyaltyClass and LoyaltyObject specifications
export function generateGoogleWalletPass(passData) {
  const issuerId = config.googleWalletIssuerId || '33880000000223344'
  const classId = `${issuerId}.loyaltea_prog_${passData.program_id.replace(/-/g, '_')}`
  const objectId = `${issuerId}.membership_${passData.membership_id.replace(/-/g, '_')}`

  const isPoints = passData.model === 'POINTS'
  const balanceStr = String(passData.balance)
  const unitLabel = isPoints ? 'Points' : 'Stamps'
  const rewardLabel = passData.activeReward ? passData.activeReward.name : 'Exclusive Reward'

  const loyaltyClass = {
    id: classId,
    issuerName: passData.business_name || 'Loyaltea Business',
    programName: passData.program_name || 'Loyalty Program',
    reviewStatus: 'UNDER_REVIEW',
    hexBackgroundColor: '#26433d',
    programLogo: {
      sourceUri: {
        uri: passData.logo_url || 'https://loyaltea.vercel.app/favicon.svg',
      },
      contentDescription: {
        defaultValue: {
          language: 'en-US',
          value: passData.business_name || 'Business Logo',
        },
      },
    },
  }

  const loyaltyObject = {
    id: objectId,
    classId: classId,
    state: 'ACTIVE',
    accountId: passData.secure_token,
    accountName: passData.customer_name || 'Loyalty Member',
    barcode: {
      type: 'QR_CODE',
      value: passData.secure_token,
      alternateText: passData.secure_token,
    },
    loyaltyPoints: {
      balance: {
        string: balanceStr,
      },
      label: unitLabel,
    },
    secondaryLoyaltyPoints: {
      balance: {
        string: rewardLabel,
      },
      label: 'Offer',
    },
    hexBackgroundColor: '#26433d',
    messages: [
      {
        header: 'Welcome to Loyaltea',
        body: `Present this QR code at ${passData.business_name} to earn ${unitLabel.toLowerCase()} and claim rewards.`,
      },
    ],
    linksModuleData: {
      uris: [
        {
          uri: 'https://loyaltea.vercel.app',
          description: 'View full account & history on Loyaltea',
        },
      ],
    },
  }

  // Construct Save to Google Wallet link
  // If private key & service account are available, sign the standard JWT
  let saveUrl = null
  let jwtToken = null

  if (config.googleWalletPrivateKey && config.googleWalletClientEmail) {
    try {
      const header = { alg: 'RS256', typ: 'JWT' }
      const claims = {
        iss: config.googleWalletClientEmail,
        aud: 'google',
        typ: 'savetowallet',
        iat: Math.floor(Date.now() / 1000),
        payload: {
          loyaltyClasses: [loyaltyClass],
          loyaltyObjects: [loyaltyObject],
        },
      }

      const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url')
      const payloadB64 = Buffer.from(JSON.stringify(claims)).toString('base64url')
      const signInput = `${headerB64}.${payloadB64}`

      const signature = crypto.sign('RSA-SHA256', Buffer.from(signInput), config.googleWalletPrivateKey).toString('base64url')
      jwtToken = `${signInput}.${signature}`
      saveUrl = `https://pay.google.com/gp/v/save/${jwtToken}`
    } catch (err) {
      console.error('Failed to sign Google Wallet JWT:', err.message)
    }
  }

  return {
    classId,
    objectId,
    loyaltyClass,
    loyaltyObject,
    jwt: jwtToken,
    saveUrl,
    configured: Boolean(saveUrl),
  }
}
