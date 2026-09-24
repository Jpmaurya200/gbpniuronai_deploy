// Email adapter. Defaults to a log-only stub until a provider key is added.
// Swap EMAIL_PROVIDER=resend + EMAIL_API_KEY to go live.
export async function sendEmail({ to, subject, template, data = {}, html }) {
  const provider = process.env.EMAIL_PROVIDER || 'stub'
  if (provider === 'stub' || !process.env.EMAIL_API_KEY) {
    console.log(`[MAIL:stub] -> ${to} | ${subject} | template=${template || 'raw'} | data=${JSON.stringify(data)}`)
    return { ok: true, stub: true }
  }
  try {
    if (provider === 'resend') {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.EMAIL_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.EMAIL_FROM || 'niuronai <no-reply@niuron.ai>', to, subject, html: html || `<p>${subject}</p>` }),
      })
      return { ok: res.ok }
    }
  } catch (e) {
    console.error('[MAIL] send failed', e)
  }
  return { ok: false }
}

const baseEmailStyle = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  color: #1e293b;
  background-color: #f8fafc;
  margin: 0;
  padding: 30px 15px;
`

const cardStyle = `
  max-width: 580px;
  margin: 0 auto;
  background-color: #ffffff;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  padding: 32px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.04);
`

export async function sendWelcomeEmail({ email, name }) {
  const displayName = name || 'there'
  const html = `
    <div style="${baseEmailStyle}">
      <div style="${cardStyle}">
        <div style="margin-bottom: 24px;">
          <span style="font-size: 24px; font-weight: 800; color: #7c3aed;">niuron<span style="color: #06b6d4;">ai</span></span>
        </div>
        <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0;">Welcome to niuronai, ${displayName}!</h2>
        <p style="font-size: 15px; line-height: 1.6; color: #475569;">
          Your AI-powered Google Business Profile and Local SEO workspace is ready. You are now equipped to collect 5-star customer reviews, generate on-brand owner replies with AI, and climb Google's Local 3-Pack.
        </p>
        <div style="background-color: #f1f5f9; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="margin: 0 0 8px 0; font-weight: 600; font-size: 14px; color: #334155;">Quick Start Steps:</p>
          <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #475569; line-height: 1.6;">
            <li>Create your first QR Review Campaign from the dashboard</li>
            <li>Download and display your custom QR poster</li>
            <li>Run a free Local SEO AI Audit to diagnose your profile health</li>
          </ul>
        </div>
        <div style="margin: 28px 0 16px 0;">
          <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/dashboard" style="display: inline-block; background-color: #7c3aed; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Open My Workspace &rarr;</a>
        </div>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 28px 0;" />
        <p style="font-size: 12px; color: #94a3b8; margin: 0;">Questions? Reply to this email anytime. The niuronai Team.</p>
      </div>
    </div>
  `
  return sendEmail({
    to: email,
    subject: 'Welcome to niuronai — Boost your Google Reviews & Local SEO',
    template: 'welcome',
    data: { name, email },
    html,
  })
}

export async function sendInvoiceEmail({ email, name, invoice, plan }) {
  const planName = plan?.name || invoice?.planName || 'Pro'
  const fmtINR = (n) => '₹' + Number(n || 0).toLocaleString('en-IN')
  const html = `
    <div style="${baseEmailStyle}">
      <div style="${cardStyle}">
        <div style="margin-bottom: 24px; display: flex; justify-content: space-between;">
          <span style="font-size: 24px; font-weight: 800; color: #7c3aed;">niuron<span style="color: #06b6d4;">ai</span></span>
        </div>
        <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px;">
          <span style="font-weight: 600; color: #065f46; font-size: 15px;">✓ Payment Received — Subscription Active</span>
        </div>
        <p style="font-size: 15px; color: #475569; margin-top: 0;">Hi ${name || 'there'}, thank you for your subscription. Your payment has been received and your invoice is ready.</p>
        <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px;">
            <span style="color: #64748b;">Invoice Number:</span>
            <strong style="color: #0f172a;">${invoice.number}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px;">
            <span style="color: #64748b;">Plan:</span>
            <strong style="color: #0f172a;">${planName} (${invoice.interval || 'monthly'})</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px;">
            <span style="color: #64748b;">Subtotal:</span>
            <span style="color: #0f172a;">${fmtINR(invoice.subtotal)}</span>
          </div>
          ${invoice.discount > 0 ? `
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; color: #059669;">
            <span>Discount:</span>
            <span>-${fmtINR(invoice.discount)}</span>
          </div>` : ''}
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px;">
            <span style="color: #64748b;">GST (18%):</span>
            <span style="color: #0f172a;">${fmtINR(invoice.tax)}</span>
          </div>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 10px 0;" />
          <div style="display: flex; justify-content: space-between; font-size: 16px;">
            <strong style="color: #0f172a;">Total Paid:</strong>
            <strong style="color: #7c3aed;">${fmtINR(invoice.total)}</strong>
          </div>
        </div>
        <div style="margin: 24px 0 16px 0;">
          <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/billing" style="display: inline-block; background-color: #7c3aed; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">View Invoices & Billing &rarr;</a>
        </div>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 28px 0;" />
        <p style="font-size: 12px; color: #94a3b8; margin: 0;">SAC Code: 998313 (Information Technology Software Services). niuronai HQ.</p>
      </div>
    </div>
  `
  return sendEmail({
    to: email,
    subject: `Payment Receipt: ${invoice.number} (${fmtINR(invoice.total)}) - niuronai`,
    template: 'invoice',
    data: { invoiceId: invoice.id, total: invoice.total },
    html,
  })
}

export async function sendReviewAlertEmail({ email, businessName, reviewerName, rating, text }) {
  const html = `
    <div style="${baseEmailStyle}">
      <div style="${cardStyle}">
        <div style="margin-bottom: 24px;">
          <span style="font-size: 24px; font-weight: 800; color: #7c3aed;">niuron<span style="color: #06b6d4;">ai</span></span>
        </div>
        <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px;">
          <span style="font-weight: 600; color: #991b1b; font-size: 15px;">⚠️ Urgent Review Alert: ${rating} Star Review Received</span>
        </div>
        <p style="font-size: 15px; color: #475569; margin-top: 0;">
          A customer recently reviewed <strong>${businessName}</strong> with a ${rating}-star rating.
        </p>
        <div style="border-left: 4px solid #ef4444; background-color: #f8fafc; padding: 14px 16px; margin: 18px 0; border-radius: 0 8px 8px 0;">
          <p style="font-weight: 600; margin: 0 0 6px 0; color: #1e293b;">${reviewerName || 'Customer'} wrote:</p>
          <p style="font-style: italic; color: #475569; margin: 0; line-height: 1.5;">"${text || 'No written comment'}"</p>
        </div>
        <p style="font-size: 14px; color: #475569;">
          Prompt, empathetic replies can de-escalate customer frustration and protect your Google rating.
        </p>
        <div style="margin: 24px 0 16px 0;">
          <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/reviews?status=unanswered" style="display: inline-block; background-color: #7c3aed; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Generate AI Reply in Inbox &rarr;</a>
        </div>
      </div>
    </div>
  `
  return sendEmail({
    to: email,
    subject: `⚠️ Urgent: New ${rating}★ review for ${businessName}`,
    template: 'review_alert',
    data: { businessName, rating },
    html,
  })
}

export async function sendTeamInviteEmail({ email, inviterName, orgName, inviteLink, role = 'member' }) {
  const html = `
    <div style="${baseEmailStyle}">
      <div style="${cardStyle}">
        <div style="margin-bottom: 24px;">
          <span style="font-size: 24px; font-weight: 800; color: #7c3aed;">niuron<span style="color: #06b6d4;">ai</span></span>
        </div>
        <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0;">You've been invited to join ${orgName || 'a workspace'}!</h2>
        <p style="font-size: 15px; line-height: 1.6; color: #475569;">
          <strong>${inviterName || 'A team administrator'}</strong> has invited you to collaborate on the <strong>${orgName || 'niuronai'}</strong> workspace as a <strong>${role}</strong>.
        </p>
        <p style="font-size: 14px; color: #475569;">
          With niuronai, you can manage customer reviews, review campaigns, and Local SEO rankings together.
        </p>
        <div style="margin: 28px 0 16px 0;">
          <a href="${inviteLink}" style="display: inline-block; background-color: #7c3aed; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Accept Invitation & Join &rarr;</a>
        </div>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 28px 0;" />
        <p style="font-size: 12px; color: #94a3b8; margin: 0;">If you were not expecting this invitation, you can ignore this email.</p>
      </div>
    </div>
  `
  return sendEmail({
    to: email,
    subject: `Invitation to join ${orgName || 'niuronai workspace'}`,
    template: 'team_invite',
    data: { email, orgName, role },
    html,
  })
}
