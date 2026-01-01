export const getPrivacyPolicy = (req, res) => {
  res.json({
    title: "Privacy Policy",
    updatedAt: "2024-11-01",
    content: "Your privacy matters. This is a placeholder policy."
  });
};

export const getHelpSupport = (req, res) => {
  res.json({
    email: "support@yourapp.com",
    faqUrl: "https://yourapp.com/help"
  });
};
