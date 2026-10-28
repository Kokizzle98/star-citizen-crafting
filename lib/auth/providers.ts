export const AUTH_PROVIDERS = {
  'custom:citizen-id': {
    vectorCode: 'CITIZEN_ID',
    enabled: process.env.CITIZEN_ID_ENABLED === 'true',
  },
} as const
export type AuthProviderId = keyof typeof AUTH_PROVIDERS
export function getAuthProvider(id: string) { return AUTH_PROVIDERS[id as AuthProviderId] }
