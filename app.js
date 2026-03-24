// ================= app.js =================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc,
  collection, addDoc, onSnapshot, query, orderBy,
  where, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
const editCodeBtn      = document.getElementById("edit-code-btn");
const editCodeArea    = document.getElementById("edit-code-area");
const newCodeInput    = document.getElementById("new-code-input");
const saveCodeBtn      = document.getElementById("save-code-btn");
const cancelCodeBtn   = document.getElementById("cancel-code-btn");
const codeError        = document.getElementById("code-error");

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
let unsubscribeInbox    = null; // New listener tracker
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
function openChatView() {
  chatScreen.classList.add("chat-open");
}

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
    unsubscribeInbox?.();
    unsubscribeMessages?.();
    unsubscribeTyping?.();
    
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

  addContactBtn.disabled = true;
  addContactBtn.innerText = "…";

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

    const existingRef = doc(db, "users", currentUser.uid, "contacts", contactUid);
    await setDoc(existingRef, { uid: contactUid, addedAt: Date.now() });

    addContactInput.value = "";
    contactError.style.color = "green";
    contactError.innerText = "Contact added!";
    setTimeout(() => { clearError(contactError); contactError.style.color = ""; }, 2000);
  } catch (err) {
    contactError.innerText = `Error: ${err.message}`;
  } finally {
    addContactBtn.disabled = false;
    addContactBtn.innerText = "Add";
  }
};

// ─── Real-time Contact Loading ──────────────────────────────────────────────

function loadContacts() {
  unsubscribeContacts?.();
  unsubscribeInbox?.();

  const contactsRef = collection(db, "users", currentUser.uid, "contacts");
  const inboxRef = collection(db, "users", currentUser.uid, "inbox");

  // Listen to manual contacts
  unsubscribeContacts = onSnapshot(query(contactsRef, orderBy("addedAt", "asc")), async (contactsSnap) => {
    const manualContacts = new Map();
    for (const docSnap of contactsSnap.docs) {
      const { uid } = docSnap.data();
      const userRef = await getDoc(doc(db, "users", uid));
      manualContacts.set(uid, userRef.exists() ? userRef.data().code : "Unknown");
    }

    // Listen to Inbox (iMessage-style)
    unsubscribeInbox = onSnapshot(inboxRef, async (inboxSnap) => {
      const inboxUids = new Map();
      for (const inboxDoc of inboxSnap.docs) {
        const senderUid = inboxDoc.id;
        if (!manualContacts.has(senderUid)) {
          const userRef = await getDoc(doc(db, "users", senderUid));
          inboxUids.set(senderUid, userRef.exists() ? userRef.data().code : senderUid);
        }
      }
      renderContactsList(manualContacts, inboxUids);
    });
  });
}

function renderContactsList(manualContacts, inboxUids) {
  contactsList.innerHTML = "";
  for (const [uid, code] of manualContacts) renderContactItem(uid, code, false);
  for (const [uid, code] of inboxUids) renderContactItem(uid, code, true);
}

function renderContactItem(uid, code, isInboxOnly) {
  const item = document.createElement("div");
  item.classList.add("contact-item");
  if (isInboxOnly) item.classList.add("inbox-only");

  const nameSpan = document.createElement("span");
  nameSpan.innerText = code;
  item.appendChild(nameSpan);

  // Delete button logic
  const delBtn = document.createElement("button");
  delBtn.innerText = "✕";
  delBtn.classList.add("delete-contact-btn");
  delBtn.onclick = (e) => deleteContact(uid, e);
  item.appendChild(delBtn);

  if (isInboxOnly) {
    const badge = document.createElement("span");
    badge.classList.add("inbox-badge");
    badge.innerText = "New";
    item.appendChild(badge);
  }

  if (currentChatId === getChatId(currentUser.uid, uid)) item.classList.add("active");

  item.onclick = () => selectContact(uid, code, item);
  contactsList.appendChild(item);
}

async function deleteContact(contactUid, event) {
  event.stopPropagation();
  if (!confirm("Remove this contact and clear conversation?")) return;

  try {
    // Delete from Inbox AND Contacts
    await deleteDoc(doc(db, "users", currentUser.uid, "inbox", contactUid));
    await deleteDoc(doc(db, "users", currentUser.uid, "contacts", contactUid));

    if (currentPartnerUid === contactUid) {
      activeChatWindow.classList.add("hidden");
      noChatSelected.classList.remove("hidden");
      currentChatId = null;
      currentPartnerUid = null;
      unsubscribeMessages?.();
    }
  } catch (err) {
    console.error("Delete failed:", err);
  }
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
  
  openChatView();
  loadMessages();
  listenForTyping();
}

// ─── Messaging ───────────────────────────────────────────────────────────────

function loadMessages() {
  if (!currentChatId) return;
  unsubscribeMessages?.();

  const q = query(collection(db, "chats", currentChatId, "messages"), orderBy("createdAt"));

  unsubscribeMessages = onSnapshot(q, (snapshot) => {
    messagesDiv.innerHTML = "";
    snapshot.forEach((docSnap) => {
      const msg = docSnap.data();
      const isSent = msg.sender === currentUser.uid;
      const bubble = document.createElement("div");
      bubble.classList.add("message", isSent ? "sent" : "received");

      const textSpan = document.createElement("span");
      textSpan.classList.add("message-text");
      textSpan.innerText = msg.text;
      bubble.appendChild(textSpan);

      if (isSent) {
        const isRead = msg.readBy && Object.keys(msg.readBy).some(uid => uid !== currentUser.uid);
        const receipt = document.createElement("span");
        receipt.classList.add("read-receipt", isRead ? "is-read" : "sent");
        receipt.innerText = isRead ? "✓✓" : "✓";
        bubble.appendChild(receipt);
      }
      messagesDiv.appendChild(bubble);
    });
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    markMessagesAsRead(currentChatId);
  });
}

async function markMessagesAsRead(chatId) {
  const q = query(collection(db, "chats", chatId, "messages"));
  const snap = await getDocs(q);
  snap.forEach((docSnap) => {
    const msg = docSnap.data();
    if (msg.sender !== currentUser.uid && !msg.readBy?.[currentUser.uid]) {
      updateDoc(docSnap.ref, { [`readBy.${currentUser.uid}`]: Date.now() });
    }
  });
}

sendBtn.onclick = async () => {
  if (!currentChatId || !messageInput.value.trim()) return;
  const text = messageInput.value.trim();
  messageInput.value = "";

  await addDoc(collection(db, "chats", currentChatId, "messages"), {
    text,
    sender: currentUser.uid,
    createdAt: Date.now(),
    readBy: {}
  });

  await setDoc(doc(db, "users", currentPartnerUid, "inbox", currentUser.uid), {
    lastMessageAt: Date.now(),
    senderUid: currentUser.uid
  }, { merge: true });
};

messageInput.onkeypress = (e) => { if (e.key === "Enter") sendBtn.click(); };

// ─── Typing Logic ─────────────────────────────────────────────────────────────

function setTypingState(isTyping) {
  if (!currentChatId) return;
  setDoc(doc(db, "chats", currentChatId, "typing", currentUser.uid), { 
    isTyping, updatedAt: Date.now() 
  }, { merge: true });
}

messageInput.oninput = () => {
  setTypingState(true);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => setTypingState(false), TYPING_TIMEOUT_MS);
};

function listenForTyping() {
  unsubscribeTyping?.();
  if (!currentChatId || !currentPartnerUid) return;
  unsubscribeTyping = onSnapshot(doc(db, "chats", currentChatId, "typing", currentPartnerUid), (snap) => {
    if (snap.exists() && snap.data().isTyping && (Date.now() - snap.data().updatedAt < 4000)) {
      typingIndicator.innerText = `${currentPartnerCode} is typing…`;
      typingIndicator.classList.remove("hidden");
    } else {
      typingIndicator.classList.add("hidden");
    }
  });
}
