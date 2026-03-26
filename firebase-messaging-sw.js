// firebase-messaging-sw.js
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCh04gMSY4-oPo3IC0Y2QUXwlbbTh0VLhs",
  authDomain: "pulse-57286.firebaseapp.com",
  projectId: "pulse-57286",
  storageBucket: "pulse-57286.firebasestorage.app",
  messagingSenderId: "85551122165",
  appId: "1:85551122165:web:84b7aac887e3a01e5167bc"
});

const messaging = firebase.messaging();

// Handles notifications when the tab is closed or in the background
messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification.title || "New Message";
  const notificationOptions = {
    body: payload.notification.body,
    icon: "/icon.png" // Ensure you have an icon in your root or use a URL
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
