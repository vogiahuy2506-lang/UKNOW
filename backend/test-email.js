import dotenv from 'dotenv';
dotenv.config();

import { sendSystemEmail, buildRenewalReminderEmail, buildMaintenanceEmail } from './src/utils/systemEmail.util.js';

const templates = [
  { name: 'RenewalReminder', fn: () => buildRenewalReminderEmail({ fullName: 'Test User', planName: 'Pro Plan', expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), daysLeft: 7, renewalUrl: 'https://founderai.biz/pricing' }) },
  { name: 'Maintenance', fn: () => buildMaintenanceEmail({ title: 'Bảo trì hệ thống', message: 'Hệ thống sẽ được bảo trì vào lúc 2:00 AM đêm nay.', durationMinutes: 60, startTime: new Date() }) },
];

const selected = templates[Math.floor(Math.random() * templates.length)];
console.log(`Selected template: ${selected.name}`);

try {
  const { subject, html } = selected.fn();
  await sendSystemEmail({
    to: 'phucnh622@uef.edu.vn',
    subject: `[TEST] ${subject}`,
    html,
  });
  console.log('Email sent successfully!');
} catch (err) {
  console.error('Failed to send email:', err.message);
}
