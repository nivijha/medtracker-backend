# MedTracker Backend

A comprehensive backend for the MedTracker application, built with Node.js, Express, and MongoDB.

## Features

- **Authentication & Authorization**
  - User registration and login
  - JWT-based authentication
  - Password hashing with bcrypt
  - Role-based access control (patient, doctor, admin, pharmacist)

- **User Management**
  - Complete user profiles with medical information
  - Preferences management
  - Security settings
  - Provider relationships

- **Medication Management**
  - CRUD operations for medications
  - Medication reminders
  - Refill tracking
  - Interaction checking

- **Appointment Management**
  - Appointment scheduling and management
  - Doctor availability checking
  - Appointment reminders
  - Rescheduling and cancellation

- **Prescription Management**
  - Prescription tracking
  - Refill processing
  - Transfer between pharmacies
  - Expiration tracking

- **Health Metrics Tracking**
  - Vital signs tracking (blood pressure, heart rate, temperature, etc.)
  - Weight and BMI tracking
  - Health trends visualization
  - Abnormal value alerts

- **Doctor Management**
  - Doctor profiles and verification
  - Specialty and availability management
  - Patient reviews and ratings
  - Practice information

- **File Upload**
  - Medical report upload and management
  - File download and deletion
  - Metadata management

- **Data Export**
  - Export user data in multiple formats (JSON, CSV, PDF)
  - Selective data export
  - Export history tracking

- **Notifications**
  - In-app notifications
  - Medication reminders
  - Appointment reminders
  - Refill reminders
  - Health alerts

- **Data Visualization**
  - Health metrics trends
  - Medication adherence charts
  - Appointment statistics
  - Dashboard summaries

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

### User Profile
- `GET /api/profile` - Get user profile
- `PUT /api/profile` - Update user profile
- `PUT /api/profile/preferences` - Update preferences
- `PUT /api/profile/security` - Update security settings
- `POST /api/profile/providers` - Add provider
- `DELETE /api/profile/providers/:providerId` - Remove provider
- `GET /api/profile/health-summary` - Get health summary
- `DELETE /api/profile` - Delete account

### Medications
- `GET /api/medications` - Get all medications
- `GET /api/medications/:id` - Get single medication
- `POST /api/medications` - Create medication
- `PUT /api/medications/:id` - Update medication
- `DELETE /api/medications/:id` - Delete medication
- `GET /api/medications/refill-soon` - Get medications needing refill
- `GET /api/medications/schedule` - Get today's medication schedule
- `POST /api/medications/:id/take` - Mark medication as taken
- `POST /api/medications/check-interactions` - Check medication interactions
- `GET /api/medications/adherence` - Get medication adherence

### Appointments
- `GET /api/appointments` - Get all appointments
- `GET /api/appointments/:id` - Get single appointment
- `POST /api/appointments` - Create appointment
- `PUT /api/appointments/:id` - Update appointment
- `PUT /api/appointments/:id/cancel` - Cancel appointment
- `DELETE /api/appointments/:id` - Delete appointment
- `GET /api/appointments/upcoming` - Get upcoming appointments
- `GET /api/appointments/past` - Get past appointments
- `GET /api/appointments/available-slots` - Get available time slots
- `PUT /api/appointments/:id/reschedule` - Reschedule appointment

### Prescriptions
- `GET /api/prescriptions` - Get all prescriptions
- `GET /api/prescriptions/:id` - Get single prescription
- `POST /api/prescriptions` - Create prescription
- `PUT /api/prescriptions/:id` - Update prescription
- `DELETE /api/prescriptions/:id` - Delete prescription
- `GET /api/prescriptions/active` - Get active prescriptions
- `GET /api/prescriptions/refill-needed` - Get prescriptions needing refill
- `POST /api/prescriptions/:id/refill` - Process refill
- `POST /api/prescriptions/check-interactions` - Check prescription interactions
- `POST /api/prescriptions/:id/transfer` - Transfer prescription

### Health Metrics
- `GET /api/health-metrics` - Get all health metrics
- `GET /api/health-metrics/:id` - Get single health metric
- `POST /api/health-metrics` - Create health metric
- `PUT /api/health-metrics/:id` - Update health metric
- `DELETE /api/health-metrics/:id` - Delete health metric
- `GET /api/health-metrics/summary` - Get health metrics summary
- `GET /api/health-metrics/trends` - Get health trends
- `GET /api/health-metrics/bmi` - Get BMI history

### Doctors
- `GET /api/doctors` - Get all doctors
- `GET /api/doctors/:id` - Get single doctor
- `POST /api/doctors` - Create doctor (admin only)
- `PUT /api/doctors/:id` - Update doctor
- `DELETE /api/doctors/:id` - Delete doctor (admin only)
- `PUT /api/doctors/:id/verify` - Verify doctor (admin only)
- `GET /api/doctors/:id/availability` - Get doctor availability
- `POST /api/doctors/:id/reviews` - Add doctor review
- `GET /api/doctors/specialties` - Get all specialties
- `GET /api/doctors/top-rated` - Get top rated doctors

### File Upload
- `POST /api/upload` - Upload file
- `GET /api/upload/files` - Get all uploaded files
- `GET /api/upload/files/:reportId/:fileId/download` - Download file
- `DELETE /api/upload/files/:reportId/:fileId` - Delete file
- `GET /api/upload/files/:reportId/:fileId` - Get file by ID
- `PUT /api/upload/files/:reportId/:fileId` - Update file metadata

### Data Export
- `POST /api/export` - Export user data
- `GET /api/export/history` - Get export history

### Medication Interactions
- `POST /api/medication-interactions/check` - Check medication interactions
- `POST /api/medication-interactions/check-prescriptions` - Check prescription interactions
- `POST /api/medication-interactions/check-mixed` - Check mixed interactions
- `GET /api/medication-interactions/:medicationId` - Get medication interactions
- `POST /api/medication-interactions/:medicationId/interactions` - Add interaction
- `DELETE /api/medication-interactions/:medicationId/interactions/:interactionId` - Remove interaction
- `GET /api/medication-interactions/common` - Get common interactions

### Notifications
- `GET /api/notifications` - Get all notifications
- `GET /api/notifications/:id` - Get single notification
- `PUT /api/notifications/:id/read` - Mark notification as read
- `PUT /api/notifications/read-all` - Mark all notifications as read
- `DELETE /api/notifications/:id` - Delete notification
- `POST /api/notifications/medication-reminders` - Create medication reminders
- `POST /api/notifications/appointment-reminders` - Create appointment reminders
- `POST /api/notifications/refill-reminders` - Create refill reminders
- `POST /api/notifications/test` - Send test notification

### Data Visualization
- `GET /api/visualization/health-trends` - Get health metrics trends
- `GET /api/visualization/medication-adherence` - Get medication adherence
- `GET /api/visualization/appointment-stats` - Get appointment statistics
- `GET /api/visualization/dashboard` - Get dashboard summary

## Installation

1. Clone the repository:
```bash
git clone https://github.com/your-username/medtracker-backend.git
cd medtracker-backend
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Start the server:
```bash
npm start
```

For development:
```bash
npm run dev
```

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/medtracker
JWT_SECRET=your_jwt_secret_key
```

## Database Schema

The application uses MongoDB with the following collections:

- **users** - User accounts and profiles
- **medications** - Medication information
- **appointments** - Appointment details
- **prescriptions** - Prescription records
- **healthmetrics** - Health metrics data
- **doctors** - Doctor profiles
- **reports** - Medical reports
- **notifications** - User notifications

## Security

- Passwords are hashed using bcrypt
- JWT tokens are used for authentication
- Role-based access control
- Input validation and sanitization
- Rate limiting (recommended for production)

## Testing

Run the test suite:
```bash
npm test
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.
