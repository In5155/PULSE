// ================= app.js =================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc,
  collection, addDoc, onSnapshot, query, orderBy,
  where, getDocs, collectionGroup
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

// ── Replace your addContactBtn.onclick block in app.js with this ──

addContactBtn.onclick = async () => {
  const targetCode = addContactInput.value.trim();
  if (!targetCode) return;
  clearError(contactError);

  // Disable button while working to prevent double-clicks
  addContactBtn.disabled = true;
  addContactBtn.innerText = "…";

  try {
    const q = query(collection(db, "users"), where("code", "==", targetCode));
    const snap = await getDocs(q);

    if (snap.empty) {
      contactError.innerText = "User not found. Check the username and try again.";
      return;
    }

    const contactUid = snap.docs[0].id;

    if (contactUid === currentUser.uid) {
      contactError.innerText = "You cannot add yourself.";
      return;
    }

    // Check if already added
    const existingRef = doc(db, "users", currentUser.uid, "contacts", contactUid);
    const existingSnap = await getDoc(existingRef);
    if (existingSnap.exists()) {
      contactError.innerText = "This contact is already in your list.";
      return;
    }

    await setDoc(existingRef, {
      uid: contactUid,
      addedAt: Date.now()
    });

    addContactInput.value = "";
    contactError.style.color = "green";
    contactError.innerText = "Contact added!";
    setTimeout(() => {
      contactError.innerText = "";
      contactError.style.color = "";
    }, 2000);

  } catch (err) {
    // Log the real error so you can debug it
    console.error("Add contact error:", err);
    contactError.innerText = `Error: ${err.message}`;
  } finally {
    addContactBtn.disabled = false;
    addContactBtn.innerText = "Add";
  }
};

// ─── Load Contacts + Inbox (iMessage-style) ──────────────────────────────────
// Shows BOTH manually added contacts AND anyone who has messaged you —
// just like how iMessage shows a conversation the moment someone texts you.

function loadContacts() {
  unsubscribeContacts?.();

  const contactsRef = collection(db, "users", currentUser.uid, "contacts");
  const contactsQuery = query(contactsRef, orderBy("addedAt", "asc"));

  unsubscribeContacts = onSnapshot(contactsQuery, async (snapshot) => {
    // 1. Collect manually added contacts
    const manualContacts = new Map(); // uid → code
    for (const docSnap of snapshot.docs) {
      const { uid } = docSnap.data();
      const userRef = await getDoc(doc(db, "users", uid));
      const code = userRef.exists() ? userRef.data().code : "Unknown User";
      manualContacts.set(uid, code);
    }

    // 2. Find all chats where current user has been messaged
    //    Chat IDs are always "{smallerUid}_{largerUid}" so we can filter by
    //    whether the chat ID contains our uid.
    const inboxUids = new Map(); // uid → code  (people who texted us but we haven't added)

    // Query all chats that contain the current user's uid in the chat id.
    // Firestore doesn't support substring queries, so we fetch chats via
    // collectionGroup on "messages" and look for sender != us in chats we're in.
    // Instead, we scan chats by constructing possible chat IDs from known users
    // isn't feasible at scale — the practical approach used by iMessage-style apps
    // is to write a "participants" field on each chat when a message is first sent.
    // We do that automatically in sendBtn.onclick below.
    // Here we read the "inbox" subcollection we maintain on the user doc.

    const inboxRef = collection(db, "users", currentUser.uid, "inbox");
    const inboxSnap = await getDocs(inboxRef);

    for (const inboxDoc of inboxSnap.docs) {
      const senderUid = inboxDoc.id;
      if (!manualContacts.has(senderUid)) {
        const userRef = await getDoc(doc(db, "users", senderUid));
        const code = userRef.exists() ? userRef.data().code : senderUid;
        inboxUids.set(senderUid, code);
      }
    }

    // 3. Merge and render
    renderContactsList(manualContacts, inboxUids);
  });
}

function renderContactsList(manualContacts, inboxUids) {
  contactsList.innerHTML = "";

  // Render manual contacts first
  for (const [uid, code] of manualContacts) {
    renderContactItem(uid, code, false);
  }

  // Then render inbox-only (people who texted you but you haven't added)
  for (const [uid, code] of inboxUids) {
    renderContactItem(uid, code, true);
  }
}

function renderContactItem(uid, code, isInboxOnly) {
  const item = document.createElement("div");
  item.classList.add("contact-item");
  if (isInboxOnly) item.classList.add("inbox-only");

  const nameSpan = document.createElement("span");
  nameSpan.innerText = code;
  item.appendChild(nameSpan);

  if (isInboxOnly) {
    // Small badge to show this person texted you (not yet added)
    const badge = document.createElement("span");
    badge.classList.add("inbox-badge");
    badge.innerText = "New";
    item.appendChild(badge);
  }

  if (currentChatId === getChatId(currentUser.uid, uid)) {
    item.classList.add("active");
  }

  item.onclick = () => selectContact(uid, code, item);
  contactsList.appendChild(item);
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

  // Send the message
  await addDoc(collection(db, "chats", currentChatId, "messages"), {
    text,
    sender: currentUser.uid,
    createdAt: Date.now(),
    readBy: {}
  });

  // ── iMessage-style inbox entry ──────────────────────────────────────────
  // Write to the recipient's inbox so they see this conversation
  // even if they haven't added us as a contact.
  await setDoc(
    doc(db, "users", currentPartnerUid, "inbox", currentUser.uid),
    {
      lastMessageAt: Date.now(),
      senderUid: currentUser.uid
    },
    { merge: true }
  );

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
