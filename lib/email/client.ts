import nodemailer from 'nodemailer'

if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
  console.warn(
    '[email] GMAIL_USER or GMAIL_APP_PASSWORD is not set — email sending will be unavailable'
  )
}

export const emailTransport = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
})
