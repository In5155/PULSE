// ================= app.js =================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc,
  collection, addDoc, onSnapshot, query, orderBy,
  where, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ─── Firebase Config ────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  databaseURL: "YOUR_DATABASE_URL",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ─── UI References ───────────────────────────────────────────────────────────

// Auth screen
const authScreen   = document.getElementById("auth-screen");
const authError    = document.getElementById("auth-error");
const emailInput   = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn     = document.getElementById("login-btn");
const signupBtn    = document.getElementById("signup-btn");
const googleBtn    = document.getElementById("google-btn");

// App shell
const chatScreen = document.getElementById("chat-screen");
const logoutBtn  = document.getElementById("logout-btn");

// Profile / username
const userCodeDisplay = document.getElementById("user-code");
const editCodeBtn     = document.getElementById("edit-code-btn");
const editCodeArea    = document.getElementById("edit-code-area");
const newCodeInput    = document.getElementById("new-code-input");
const saveCodeBtn     = document.getElementById("save-code-btn");
const cancelCodeBtn   = document.getElementById("cancel-code-btn");
const codeError       = document.getElementById("code-error");

// Contacts
const addContactInput = document.getElementById("add-contact-input");
const addContactBtn   = document.getElementById("add-contact-btn");
const contactError    = document.getElementById("contact-error");
const contactsList    = document.getElementById("contacts-list");

// Chat area
const noChatSelected  = document.getElementById("no-chat-selected");
const activeChatWindow = document.getElementById("active-chat-window");
const chatWithHeader  = document.getElementById("chat-with-header");
const messagesDiv     = document.getElementById("messages");
const messageInput    = document.getElementById("message-input");
const sendBtn         = document.getElementById("send-btn");
const typingIndicator = document.getElementById("typing-indicator");

// ─── App State ───────────────────────────────────────────────────────────────
let currentUser       = null;
let currentChatId     = null;
let currentPartnerUid = null;
let currentPartnerCode = null;

// Active Firestore listeners – stored so they can be cancelled on cleanup
let unsubscribeMessages = null;
let unsubscribeContacts = null;
let unsubscribeTyping   = null;

// Debounce timer for the "user stopped typing" detection
let typingTimeout = null;
const TYPING_TIMEOUT_MS = 2500;

// ─── Utility Helpers ─────────────────────────────────────────────────────────

/** Creates a 6-char random alphanumeric code for new users. */
function generateUserCode() {
  return Math.random().toString(36).substring(2, 8);
}

/**
 * Derives a deterministic, shared chat document ID from two UIDs.
 * Alphabetical ordering ensures both sides produce the same key.
 */
function getChatId(uid1, uid2) {
  return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
}

/** Clears an error element's text content. */
function clearError(el) {
  el.innerText = "";
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

loginBtn.onclick = async () => {
  clearError(authError);
  try {
    await signInWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value);
  } catch (err) {
    authError.innerText = err.message;
  }
};

signupBtn.onclick = async () => {
  clearError(authError);
  try {
    const { user } = await createUserWithEmailAndPassword(
      auth, emailInput.value.trim(), passwordInput.value
    );
    // Create a user profile doc with a unique code on first sign-up
    await setDoc(doc(db, "users", user.uid), {
      email: user.email,
      code: generateUserCode()
    });
  } catch (err) {
    authError.innerText = err.message;
  }
};

googleBtn.onclick = async () => {
  clearError(authError);
  try {
    const provider = new GoogleAuthProvider();
    const { user } = await signInWithPopup(auth, provider);
    // Only create the profile doc if this is a brand-new Google sign-in
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (!userDoc.exists()) {
      await setDoc(doc(db, "users", user.uid), {
        email: user.email,
        code: generateUserCode()
      });
    }
  } catch (err) {
    authError.innerText = err.message;
  }
};

logoutBtn.onclick = () => signOut(auth);

// Central auth state handler – drives all screen transitions
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    authScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");

    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists()) {
      userCodeDisplay.innerText = userDoc.data().code;
    }

    loadContacts();
  } else {
    // Cancel all active listeners and reset state on logout
    currentUser       = null;
    currentChatId     = null;
    currentPartnerUid = null;
    currentPartnerCode = null;

    unsubscribeContacts?.();
    unsubscribeMessages?.();
    unsubscribeTyping?.();
    clearTypingState();

    activeChatWindow.classList.add("hidden");
    noChatSelected.classList.remove("hidden");
    authScreen.classList.remove("hidden");
    chatScreen.classList.add("hidden");

    emailInput.value   = "";
    passwordInput.value = "";
  }
});

// ─── Profile / Username ───────────────────────────────────────────────────────

editCodeBtn.onclick = () => {
  editCodeArea.classList.remove("hidden");
  newCodeInput.value = userCodeDisplay.innerText;
  clearError(codeError);
};

cancelCodeBtn.onclick = () => editCodeArea.classList.add("hidden");

saveCodeBtn.onclick = async () => {
  const newCode = newCodeInput.value.trim();
  if (!newCode) return;
  clearError(codeError);

  try {
    // Enforce global uniqueness before saving
    const q = query(collection(db, "users"), where("code", "==", newCode));
    const snap = await getDocs(q);
    const isTaken = !snap.empty && snap.docs[0].id !== currentUser.uid;

    if (isTaken) {
      codeError.innerText = "Username already taken.";
      return;
    }

    await updateDoc(doc(db, "users", currentUser.uid), { code: newCode });
    userCodeDisplay.innerText = newCode;
    editCodeArea.classList.add("hidden");
  } catch {
    codeError.innerText = "Error updating username.";
  }
};

// ─── Contacts ────────────────────────────────────────────────────────────────

addContactBtn.onclick = async () => {
  const targetCode = addContactInput.value.trim();
  if (!targetCode) return;
  clearError(contactError);

  try {
    const q = query(collection(db, "users"), where("code", "==", targetCode));
    const snap = await getDocs(q);

    if (snap.empty) {
      contactError.innerText = "User not found.";
      return;
    }

    const contactUid = snap.docs[0].id;
    if (contactUid === currentUser.uid) {
      contactError.innerText = "You cannot add yourself.";
      return;
    }

    // Store a reference under the current user's contacts sub-collection
    await setDoc(doc(db, "users", currentUser.uid, "contacts", contactUid), {
      uid: contactUid,
      addedAt: Date.now()
    });

    addContactInput.value = "";
  } catch {
    contactError.innerText = "Error adding contact.";
  }
};

function loadContacts() {
  unsubscribeContacts?.();

  const q = query(
    collection(db, "users", currentUser.uid, "contacts"),
    orderBy("addedAt", "asc")
  );

  unsubscribeContacts = onSnapshot(q, (snapshot) => {
    contactsList.innerHTML = "";

    snapshot.forEach(async (docSnap) => {
      const { uid } = docSnap.data();

      // Fetch the contact's latest display code
      const userRef = await getDoc(doc(db, "users", uid));
      const contactCode = userRef.exists() ? userRef.data().code : "Unknown User";

      const item = document.createElement("div");
      item.classList.add("contact-item");
      item.innerText = contactCode;

      if (currentChatId === getChatId(currentUser.uid, uid)) {
        item.classList.add("active");
      }

      item.onclick = () => selectContact(uid, contactCode, item);
      contactsList.appendChild(item);
    });
  });
}

function selectContact(partnerUid, partnerCode, itemEl) {
  // Update active highlight in sidebar
  document.querySelectorAll(".contact-item").forEach(el => el.classList.remove("active"));
  itemEl.classList.add("active");

  // Update shared state
  currentPartnerUid  = partnerUid;
  currentPartnerCode = partnerCode;
  currentChatId      = getChatId(currentUser.uid, partnerUid);

  // Show chat panel
  noChatSelected.classList.add("hidden");
  activeChatWindow.classList.remove("hidden");
  chatWithHeader.innerText = partnerCode;
  typingIndicator.classList.add("hidden");

  loadMessages();
  listenForTyping();
}

// ─── Read Receipts ────────────────────────────────────────────────────────────
//
// Data model: each message document carries a `readBy` map
// where keys are reader UIDs and values are the read timestamp.
//   readBy: { "<uid>": <timestamp> }
//
// A message is considered "read" by the current viewer when their
// UID appears in `readBy`.  On the sender's side we show:
//   ✓   – sent (no one else in readBy yet)
//   ✓✓  – read (partner's UID present in readBy)

/**
 * Batch-marks all messages from the partner as read by the current user.
 * Called each time a conversation is opened or new messages arrive.
 */
async function markMessagesAsRead(chatId) {
  if (!chatId || !currentUser) return;

  const q = query(
    collection(db, "chats", chatId, "messages"),
    orderBy("createdAt")
  );

  const snap = await getDocs(q);
  const writes = [];

  snap.forEach((docSnap) => {
    const msg = docSnap.data();
    // Only touch messages sent by the partner that we haven't marked yet
    if (msg.sender !== currentUser.uid && !msg.readBy?.[currentUser.uid]) {
      writes.push(
        updateDoc(docSnap.ref, { [`readBy.${currentUser.uid}`]: Date.now() })
      );
    }
  });

  await Promise.all(writes);
}

// ─── Typing Indicator ─────────────────────────────────────────────────────────
//
// Data model: chats/{chatId}/typing/{uid}  →  { isTyping: bool, updatedAt: number }
//
// The current user writes their own typing doc; they listen to the partner's.
// A stale typing flag (older than TYPING_TIMEOUT_MS + buffer) is ignored so
// the indicator self-heals even if the tab closes mid-typing.

/** Writes the current user's typing state to Firestore. */
function setTypingState(isTyping) {
  if (!currentChatId || !currentUser) return;
  const ref = doc(db, "chats", currentChatId, "typing", currentUser.uid);
  setDoc(ref, { isTyping, updatedAt: Date.now() }, { merge: true });
}

/** Stops the debounce timer and immediately clears the typing flag. */
function clearTypingState() {
  clearTimeout(typingTimeout);
  if (currentChatId && currentUser) setTypingState(false);
}

// Typing detection: set flag on each keystroke, reset after idle period
messageInput.addEventListener("input", () => {
  if (!currentChatId) return;

  setTypingState(true);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => setTypingState(false), TYPING_TIMEOUT_MS);
});

/** Subscribes to the partner's typing document and updates the indicator. */
function listenForTyping() {
  unsubscribeTyping?.();
  if (!currentChatId || !currentPartnerUid) return;

  const ref = doc(db, "chats", currentChatId, "typing", currentPartnerUid);

  unsubscribeTyping = onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      typingIndicator.classList.add("hidden");
      return;
    }

    const { isTyping, updatedAt } = snap.data();
    const isStale = Date.now() - updatedAt > TYPING_TIMEOUT_MS + 1000;

    if (isTyping && !isStale) {
      typingIndicator.innerText = `${currentPartnerCode} is typing…`;
      typingIndicator.classList.remove("hidden");
    } else {
      typingIndicator.classList.add("hidden");
    }
  });
}

// ─── Messaging ───────────────────────────────────────────────────────────────

sendBtn.onclick = async () => {
  if (!currentChatId) return;
  const text = messageInput.value.trim();
  if (!text) return;

  // Clear typing state immediately on send
  clearTimeout(typingTimeout);
  setTypingState(false);

  await addDoc(collection(db, "chats", currentChatId, "messages"), {
    text,
    sender: currentUser.uid,
    createdAt: Date.now(),
    readBy: {}          // initialised empty; partner will populate their UID on read
  });

  messageInput.value = "";
};

// Allow Enter key to send
messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendBtn.click();
});

function loadMessages() {
  if (!currentChatId) return;
  unsubscribeMessages?.();

  // Capture chatId locally so async callbacks reference the right conversation
  const chatId = currentChatId;
  const q = query(
    collection(db, "chats", chatId, "messages"),
    orderBy("createdAt")
  );

  unsubscribeMessages = onSnapshot(q, (snapshot) => {
    messagesDiv.innerHTML = "";

    snapshot.forEach((docSnap) => {
      const msg    = docSnap.data();
      const isSent = msg.sender === currentUser.uid;

      const bubble = document.createElement("div");
      bubble.classList.add("message", isSent ? "sent" : "received");

      // Message text
      const textSpan = document.createElement("span");
      textSpan.classList.add("message-text");
      textSpan.innerText = msg.text;
      bubble.appendChild(textSpan);

      // Read receipt tick – only visible on messages we sent
      if (isSent) {
        const isRead = msg.readBy &&
          Object.keys(msg.readBy).some(uid => uid !== currentUser.uid);

        const receipt = document.createElement("span");
        receipt.classList.add("read-receipt");
        receipt.innerText = isRead ? "✓✓" : "✓";
        receipt.title     = isRead ? "Read" : "Sent";
        if (isRead) receipt.classList.add("is-read");
        bubble.appendChild(receipt);
      }

      messagesDiv.appendChild(bubble);
    });

    // Keep scroll pinned to the latest message
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    // Mark partner's messages as read now that they are visible
    markMessagesAsRead(chatId);
  });
}
