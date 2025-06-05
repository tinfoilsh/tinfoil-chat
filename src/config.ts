const API_BASE_URL: string =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.tinfoil.sh'
const OHTTP_RELAY_URL: string =
  process.env.NEXT_PUBLIC_OHTTP_RELAY_URL ??
  'https://tinfoil-ohttp-relay-prod.fastly-edge.com'
const OHTTP_KEY_CONFIG: string =
  process.env.NEXT_PUBLIC_OHTTP_KEY_CONFIG ??
  '00290000205c90dadb93b071bbe3b965cded67246779dee8ad8c9f4a4c453493301305657700040001000100298000208021dabea185ee4d675a95209f6f4b9e8749104c47c99ea38780500a88b1aa1c000400010001'

export { API_BASE_URL, OHTTP_KEY_CONFIG, OHTTP_RELAY_URL }
