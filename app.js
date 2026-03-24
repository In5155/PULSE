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

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCh04gMSY4-oPo3IC0Y2QUXwlbbTh0VLhs",
  authDomain: "pulse-57286.firebaseapp.com",
  projectId: "pulse-57286",
  storageBucket: "pulse-57286.firebasestorage.app",
  messagingSenderId: "85551122165",
  appId: "1:85551122165:web:84b7aac887e3a01e5167bc",
  measurementId: "G-N3LX2FVEGK"
};


const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ─── UI References ───────────────────────────────────────────────────────────

const authScreen    = document.getElementById("auth-screen");
const authError     = document.getElementById("auth-error");
const emailInput    = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn      = document.getElementById("login-btn");
const signupBtn     = document.getElementById("signup-btn");
const googleBtn     = document.getElementById("google-btn");

const chatScreen = document.getElementById("chat-screen");
const logoutBtn  = document.getElementById("logout-btn");
const backBtn    = document.getElementById("back-btn");

const userCodeDisplay = document.getElementById("user-code");
const editCodeBtn     = document.getElementById("edit-code-btn");
const editCodeArea    = document.getElementById("edit-code-area");
const newCodeInput    = document.getElementById("new-code-input");
const saveCodeBtn     = document.getElementById("save-code-btn");
const cancelCodeBtn   = document.getElementById("cancel-code-btn");
const codeError       = document.getElementById("code-error");

const addContactInput = document.getElementById("add-contact-input");
const addContactBtn   = document.getElementById("add-contact-btn");
const contactError    = document.getElementById("contact-error");
const contactsList    = document.getElementById("contacts-list");

const noChatSelected   = document.getElementById("no-chat-selected");
const activeChatWindow = document.getElementById("active-chat-window");
const chatWithHeader   = document.getElementById("chat-with-header");
const messagesDiv      = document.getElementById("messages");
const messageInput     = document.getElementById("message-input");
const sendBtn          = document.getElementById("send-btn");
const typingIndicator  = document.getElementById("typing-indicator");

// ─── App State ───────────────────────────────────────────────────────────────
let currentUser        = null;
let currentChatId      = null;
let currentPartnerUid  = null;
let currentPartnerCode = null;

let unsubscribeMessages = null;
let unsubscribeContacts = null;
let unsubscribeTyping   = null;

let typingTimeout = null;
const TYPING_TIMEOUT_MS = 2500;

// ─── Utility Helpers ─────────────────────────────────────────────────────────

function generateUserCode() {
  return Math.random().toString(36).substring(2, 8);
}

function getChatId(uid1, uid2) {
  return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
}

function clearError(el) {
  el.innerText = "";
}

// ─── Mobile Navigation ───────────────────────────────────────────────────────

/** Slides into the chat view on mobile (adds class to trigger CSS transition). */
function openChatView() {
  chatScreen.classList.add("chat-open");
}

/** Slides back to the contacts list on mobile. */
function closeChatView() {
  chatScreen.classList.remove("chat-open");
}

backBtn.onclick = closeChatView;

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
    currentUser        = null;
    currentChatId      = null;
    currentPartnerUid  = null;
    currentPartnerCode = null;

    unsubscribeContacts?.();
    unsubscribeMessages?.();
    unsubscribeTyping?.();
    clearTypingState();

    closeChatView();
    activeChatWindow.classList.add("hidden");
    noChatSelected.classList.remove("hidden");
    authScreen.classList.remove("hidden");
    chatScreen.classList.add("hidden");

    emailInput.value    = "";
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
  document.querySelectorAll(".contact-item").forEach(el => el.classList.remove("active"));
  itemEl.classList.add("active");

  currentPartnerUid  = partnerUid;
  currentPartnerCode = partnerCode;
  currentChatId      = getChatId(currentUser.uid, partnerUid);

  noChatSelected.classList.add("hidden");
  activeChatWindow.classList.remove("hidden");
  chatWithHeader.innerText = partnerCode;
  typingIndicator.classList.add("hidden");

  // Slide into chat view on mobile
  openChatView();

  loadMessages();
  listenForTyping();
}

// ─── Read Receipts ────────────────────────────────────────────────────────────

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
    if (msg.sender !== currentUser.uid && !msg.readBy?.[currentUser.uid]) {
      writes.push(
        updateDoc(docSnap.ref, { [`readBy.${currentUser.uid}`]: Date.now() })
      );
    }
  });

  await Promise.all(writes);
}

// ─── Typing Indicator ─────────────────────────────────────────────────────────

function setTypingState(isTyping) {
  if (!currentChatId || !currentUser) return;
  const ref = doc(db, "chats", currentChatId, "typing", currentUser.uid);
  setDoc(ref, { isTyping, updatedAt: Date.now() }, { merge: true });
}

function clearTypingState() {
  clearTimeout(typingTimeout);
  if (currentChatId && currentUser) setTypingState(false);
}

messageInput.addEventListener("input", () => {
  if (!currentChatId) return;
  setTypingState(true);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => setTypingState(false), TYPING_TIMEOUT_MS);
});

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

  clearTimeout(typingTimeout);
  setTypingState(false);

  await addDoc(collection(db, "chats", currentChatId, "messages"), {
    text,
    sender: currentUser.uid,
    createdAt: Date.now(),
    readBy: {}
  });

  messageInput.value = "";
};

messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendBtn.click();
});

function loadMessages() {
  if (!currentChatId) return;
  unsubscribeMessages?.();

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

      const textSpan = document.createElement("span");
      textSpan.classList.add("message-text");
      textSpan.innerText = msg.text;
      bubble.appendChild(textSpan);

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

    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    markMessagesAsRead(chatId);
  });
}
