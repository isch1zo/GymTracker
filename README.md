# 🏋️‍♂️ Gym Tracker

A modern, feature-rich web application for tracking your gym workouts, exercises, and fitness progress. Built with vanilla JavaScript and Firebase for real-time data synchronization.

![Gym Tracker](https://img.shields.io/badge/Status-Active-brightgreen)
![Firebase](https://img.shields.io/badge/Firebase-Integrated-orange)
![Responsive](https://img.shields.io/badge/Design-Responsive-blue)

## ✨ Features

### 🎯 Core Functionality
- **Exercise Management**: Add, edit, and delete exercises across three muscle groups (Push, Pull, Legs)
- **Image Support**: Upload and manage exercise images with automatic compression
- **Weight Tracking**: Track weights for each exercise with persistent storage
- **Daily Workout Plans**: Create and follow structured daily workout routines
- **Progress Tracking**: Monitor workout completion and maintain streaks

### 🔥 Advanced Features
- **Real-time Sync**: Firebase integration for cross-device synchronization
- **Guest Mode**: Use the app without registration for quick access
- **Image Compression**: Automatic image optimization (WebP/JPEG) for optimal storage
- **Responsive Design**: Perfect experience on desktop, tablet, and mobile devices
- **Dark Theme Support**: Modern UI with smooth animations and transitions

### 📊 Analytics & Stats
- **BMI Calculator**: Built-in BMI calculation and tracking
- **Workout Statistics**: Track completed exercises and daily progress
- **Achievement System**: Celebrate milestones with confetti animations
- **Progress Visualization**: Visual indicators for workout completion

## 🚀 Getting Started

### Prerequisites
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Firebase project (for data persistence)
- Internet connection (for Firebase sync)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/isch1zo/GymTracker.git
   cd GymTracker
   ```

2. **Firebase Setup**
   - Create a new Firebase project at [Firebase Console](https://console.firebase.google.com)
   - Enable Authentication (Email/Password)
   - Enable Firestore Database
   - Enable Storage (optional, for image uploads)
   - Copy your Firebase configuration

3. **Configure Firebase**
   - Open `gym-tracker.js`
   - Replace the Firebase configuration object with your project's config:
   ```javascript
   const firebaseConfig = {
     apiKey: "your-api-key",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project-id",
     storageBucket: "your-project.appspot.com",
     messagingSenderId: "your-sender-id",
     appId: "your-app-id"
   };
   ```

4. **Deploy**
   - Upload files to your web server or use Firebase Hosting
   - Access the application through your domain

### Quick Start (Local Development)
1. Open `gym-tracker.html` in your web browser
2. Click "Continue as Guest" for immediate access
3. Start adding exercises and tracking workouts!

## 📱 Usage Guide

### 🏃‍♂️ Getting Started
1. **Sign Up/Login**: Create an account or use guest mode
2. **Profile Setup**: Enter your height, weight, and fitness goals
3. **Add Exercises**: Create exercises in Push, Pull, or Legs categories
4. **Upload Images**: Add reference images for proper form
5. **Start Tracking**: Use the daily workout planner to track progress

### 💪 Exercise Management
- **Add Exercise**: Click the "+" button in any category
- **Edit Exercise**: Click the ✏️ button to modify name or image
- **Delete Exercise**: Click the 🗑️ button to remove
- **Weight Tracking**: Enter weights directly in the exercise cards

### 📅 Daily Workouts
- **Select Date**: Choose your workout date
- **Pick Muscle Group**: Select Push, Pull, or Legs
- **Track Progress**: Check off completed exercises
- **View Stats**: Monitor completion rates and streaks

### 🖼️ Image Features
- **Upload Images**: Add exercise reference photos
- **Auto Compression**: Images are automatically optimized
- **Zoom View**: Click images for fullscreen viewing
- **Storage Efficient**: Smart compression reduces storage usage

## 🛠️ Technical Details

### Architecture
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Firebase (Authentication, Firestore, Storage)
- **Storage**: Firestore for data, separate subcollection for images
- **Compression**: Client-side image compression with WebP/JPEG fallback

### Key Technologies
- **Firebase Authentication**: Secure user management
- **Firestore Database**: Real-time NoSQL database
- **Firebase Storage**: Scalable file storage (optional)
- **Progressive Web App**: Responsive design with mobile optimization
- **Image Processing**: Canvas-based compression and optimization

### Performance Optimizations
- **Lazy Loading**: Images load asynchronously
- **Caching**: Client-side image caching prevents re-downloads
- **Compression**: Multi-level image compression (99% size reduction)
- **Efficient Storage**: Separate image documents prevent size limits

## 📊 Data Structure

### User Document
```javascript
{
  stats: {
    height: "175",
    weight: "70",
    goalWeight: "65",
    bmi: "22.9"
  },
  exercises: {
    push: [{ id, name, weight, hasImage }],
    pull: [{ id, name, weight, hasImage }],
    legs: [{ id, name, weight, hasImage }]
  },
  dailyProgress: {
    "2024-01-01": { exerciseId: true/false }
  }
}
```

### Image Documents
```javascript
// Collection: users/{userId}/images/{imageId}
{
  imageData: "base64-encoded-image",
  timestamp: serverTimestamp()
}
```

## 🎨 UI/UX Features

### Modern Design
- **Clean Interface**: Minimalist design with intuitive navigation
- **Smooth Animations**: Hover effects and transitions
- **Visual Feedback**: Loading states and success indicators
- **Consistent Styling**: Unified color scheme and typography

### Responsive Layout
- **Mobile First**: Optimized for mobile devices
- **Tablet Support**: Perfect medium-screen experience
- **Desktop Enhanced**: Full-featured desktop interface
- **Cross-browser**: Compatible with all modern browsers

### Accessibility
- **Keyboard Navigation**: Full keyboard support
- **Screen Reader**: Semantic HTML and ARIA labels
- **High Contrast**: Clear visual hierarchy
- **Touch Friendly**: Large touch targets for mobile

## 🔧 Configuration

### Firebase Security Rules

**Firestore Rules:**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      match /images/{imageId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

**Storage Rules (if using Firebase Storage):**
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### Environment Variables
- No environment variables required
- All configuration is in the Firebase config object
- Guest mode works without any setup

## 🚀 Deployment

### Firebase Hosting
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
firebase deploy
```

### Static Hosting
- Upload `gym-tracker.html`, `gym-tracker.js`, and `exercises/` folder
- Ensure HTTPS for Firebase compatibility
- Configure proper MIME types for image files

### CDN Deployment
- All files are self-contained
- No build process required
- Can be deployed to any static hosting service

## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit changes**: `git commit -m 'Add amazing feature'`
4. **Push to branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request**

### Development Guidelines
- Follow existing code style and conventions
- Test on multiple devices and browsers
- Ensure Firebase integration works correctly
- Update documentation for new features

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**[@isch1zo](https://github.com/isch1zo)**
- GitHub: [https://github.com/isch1zo](https://github.com/isch1zo)
- Project: [GymTracker](https://github.com/isch1zo/GymTracker)

## 🙏 Acknowledgments

- **Firebase**: For providing excellent backend services
- **Web APIs**: Canvas API for image processing
- **Community**: For feedback and feature suggestions
- **Open Source**: Built with love for the fitness community

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/isch1zo/GymTracker/issues)
- **Discussions**: [GitHub Discussions](https://github.com/isch1zo/GymTracker/discussions)
- **GitHub**: [@isch1zo](https://github.com/isch1zo)

## 🔮 Roadmap

### Upcoming Features
- [ ] Exercise video support
- [ ] Workout templates and programs
- [ ] Social features and sharing
- [ ] Advanced analytics and charts
- [ ] Nutrition tracking integration
- [ ] Wearable device sync
- [ ] Offline mode support
- [ ] Multi-language support

### Version History
- **v1.0.0**: Initial release with core features
- **v1.1.0**: Added image support and compression
- **v1.2.0**: Enhanced UI/UX and mobile optimization
- **v1.3.0**: Daily workout planner and progress tracking

---

## ⭐ Show Your Support

If you found this project helpful, please consider:
- ⭐ **Starring** the repository on GitHub
- 🍴 **Forking** it to contribute
- 🐛 **Reporting** any issues you find
- 💡 **Suggesting** new features
- 📢 **Sharing** it with fellow fitness enthusiasts

---

**Made with ❤️ by [@isch1zo](https://github.com/isch1zo) for fitness enthusiasts worldwide**

*Start your fitness journey today with Gym Tracker!* 🏋️‍♂️💪

### 📊 Project Stats
![GitHub stars](https://img.shields.io/github/stars/isch1zo/GymTracker?style=social)
![GitHub forks](https://img.shields.io/github/forks/isch1zo/GymTracker?style=social)
![GitHub issues](https://img.shields.io/github/issues/isch1zo/GymTracker)
![GitHub license](https://img.shields.io/github/license/isch1zo/GymTracker)
