const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.BREVO_SMTP_HOST,
  port: process.env.BREVO_SMTP_PORT,
  auth: {
    user: process.env.BREVO_SMTP_EMAIL,
    pass: process.env.BREVO_SMTP_PASSWORD,
  },
});

module.exports = { emailService: transporter };
