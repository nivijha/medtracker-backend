import nodemailer from "nodemailer";

const sendEmail = async (options) => {
  let transporter;

  // If no SMTP credentials exist in env, automatically generate an Ethereal test account
  if (!process.env.SMTP_HOST || !process.env.SMTP_EMAIL) {
    console.log("No SMTP credentials found in .env. Generating Ethereal test account...");
    const testAccount = await nodemailer.createTestAccount();
    
    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: testAccount.user, // generated ethereal user
        pass: testAccount.pass, // generated ethereal password
      },
    });
  } else {
    // Determine configuration based on the host
    const smtpHost = process.env.SMTP_HOST;
    const isGmail = smtpHost.includes("gmail");
    
    const transportConfig = isGmail 
      ? {
          service: "gmail",
          auth: {
            user: process.env.SMTP_EMAIL,
            pass: process.env.SMTP_PASSWORD,
          },
        }
      : {
          host: smtpHost,
          port: process.env.SMTP_PORT || 587,
          secure: process.env.SMTP_PORT == 465, // true for 465, false for 587
          auth: {
            user: process.env.SMTP_EMAIL,
            pass: process.env.SMTP_PASSWORD,
          },
          tls: {
            // Do not fail on invalid certs – common in some cloud setups
            rejectUnauthorized: false
          }
        };

    transporter = nodemailer.createTransport(transportConfig);
  }

  // Message object
  const message = {
    from: `${process.env.FROM_NAME || "MedTracker"} <${
      process.env.FROM_EMAIL || "noreply@medtracker.com"
    }>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
    html: options.html,
  };
  try {
    const info = await transporter.sendMail(message);
    console.log("Message sent: %s", info.messageId);
  } catch (error) {
    console.error("NODEMAILER ERROR:", error);
    throw error;
  }
};

export default sendEmail;

