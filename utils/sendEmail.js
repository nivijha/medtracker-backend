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
          host: "smtp.gmail.com",
          port: 465,
          secure: true, // use SSL
          auth: {
            user: process.env.SMTP_EMAIL,
            pass: process.env.SMTP_PASSWORD,
          },
          family: 4, // Force IPv4 to avoid ENETUNREACH on IPv6
          connectionTimeout: 10000, // 10 seconds
          greetingTimeout: 10000,
          socketTimeout: 10000,
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
            rejectUnauthorized: false
          },
          family: 4, // Force IPv4
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 10000,
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

