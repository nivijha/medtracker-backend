# MedTracker Backend

A robust Node.js backend API for medical tracking and management system. This application provides secure authentication, user management, and comprehensive medical reporting features.

## 📋 Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Running the Application](#running-the-application)
- [API Endpoints](#api-endpoints)
- [Authentication](#authentication)
- [Models](#models)
- [Contributing](#contributing)

## ✨ Features

- **User Authentication**: Secure user registration and login with JWT
- **User Management**: Complete CRUD operations for user profiles
- **Medical Reports**: Create, read, update, and delete medical reports
- **Test Management**: Track and manage medical test records
- **Middleware Protection**: Route protection with authentication middleware
- **Database Integration**: Structured data models for users, reports, and tests

## 🚀 Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB (assumed based on typical Node.js structure)
- **Authentication**: JWT (JSON Web Tokens)
- **Language**: JavaScript (ES6+)

## 📁 Project Structure

```
medtracker-backend/
├── config/
│   └── db.js                 # Database configuration
├── controllers/
│   ├── authController.js     # Authentication logic
│   └── userController.js     # User management logic
├── middleware/
│   └── authMiddleware.js     # JWT authentication middleware
├── models/
│   ├── Report.js             # Medical report schema
│   ├── Test.js               # Medical test schema
│   └── User.js               # User schema
├── routes/
│   ├── authRoutes.js         # Authentication routes
│   ├── reportRoutes.js       # Report management routes
│   └── testRoutes.js         # Test management routes
├── node_modules/             # Dependencies
├── .env                      # Environment variables
├── .gitignore               # Git ignore file
├── index.js                 # Application entry point
├── middleware.js            # Global middleware configuration
├── package.json             # Project dependencies
└── package-lock.json        # Locked dependencies
```

## 📦 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v14 or higher)
- **npm** 
- **MongoDB** (local or cloud instance)

## 🔧 Installation

1. **Clone the repository**

```bash
git clone https://github.com/nivijha/medtracker-backend.git
cd medtracker-backend
```

2. **Install dependencies**

```bash
npm install
```

## 🔐 Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/medtracker
# Or for MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/medtracker

# JWT Secret
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRE=7d

# Optional: CORS Configuration
CLIENT_URL=http://localhost:3000
```

## 🏃 Running the Application

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

The server will start on `http://localhost:5000` (or your configured PORT).

## 🛣️ API Endpoints

### Authentication Routes (`/api/auth`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/auth/register` | Register new user | No |
| POST | `/api/auth/login` | User login | No |
| GET | `/api/auth/me` | Get current user | Yes |
| POST | `/api/auth/logout` | User logout | Yes |

### User Routes (`/api/users`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/users` | Get all users | Yes |
| GET | `/api/users/:id` | Get user by ID | Yes |
| PUT | `/api/users/:id` | Update user | Yes |
| DELETE | `/api/users/:id` | Delete user | Yes |

### Report Routes (`/api/reports`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/reports` | Get all reports | Yes |
| GET | `/api/reports/:id` | Get report by ID | Yes |
| POST | `/api/reports` | Create new report | Yes |
| PUT | `/api/reports/:id` | Update report | Yes |
| DELETE | `/api/reports/:id` | Delete report | Yes |

### Test Routes (`/api/tests`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/tests` | Get all tests | Yes |
| GET | `/api/tests/:id` | Get test by ID | Yes |
| POST | `/api/tests` | Create new test | Yes |
| PUT | `/api/tests/:id` | Update test | Yes |
| DELETE | `/api/tests/:id` | Delete test | Yes |

## 🔒 Authentication

This API uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header for protected routes:

```
Authorization: Bearer <your_jwt_token>
```

## 📊 Models

### User Model
- Email
- Password (hashed)
- Name
- Role
- Created/Updated timestamps

### Report Model
- User reference
- Report details
- Test results
- Date
- Status

### Test Model
- Test name
- Test type
- Results
- Reference ranges
- Date performed

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 🔗 Links

- [Frontend Repository](https://github.com/nivijha/medtracker-frontend)

---

**Note**: Make sure to never commit your `.env` file to version control. It's already included in `.gitignore` for security purposes.
