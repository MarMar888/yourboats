import { NextResponse } from 'next/server'
import { getOAuthClient } from '@/lib/qbo/client'

export async function GET() {
  const oauthClient = getOAuthClient()
  const authUri = oauthClient.authorizeUri({
    scope: ['com.intuit.quickbooks.accounting'],
    state: crypto.randomUUID(),
  })

  console.log('QBO auth URL:', authUri)
  console.log('Client ID being used:', process.env.QUICKBOOKS_CLIENT_ID)
  console.log('Redirect URI being used:', process.env.QBO_REDIRECT_URI)
  console.log('Environment:', process.env.QBO_ENVIRONMENT)

  return NextResponse.redirect(authUri)
}
