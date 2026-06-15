import admin from 'firebase-admin';

// Initialize Firebase Admin SDK for web push notifications
if (!admin.apps.length) {
  // Only initialize if Firebase credentials are provided
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
    console.log('Firebase Admin SDK initialized');
  } else {
    console.warn('Firebase credentials not found. Web push notifications will be disabled.');
  }
}

export default admin;
