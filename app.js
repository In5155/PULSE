// ================= app.js =================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc,
  collection, addDoc, onSnapshot, query, orderBy,
  where, getDocs, limit, writeBatch
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
const messageInput      = document.getElementById("message-input");
const sendBtn          = document.getElementById("send-btn");
const typingIndicator  = document.getElementById("typing-indicator");
const headerPresenceDot = document.getElementById("header-presence-dot");

// UI References for Replying
const replyBar      = document.getElementById("reply-bar");
const replyLabel    = document.getElementById("reply-label");
const replyText     = document.getElementById("reply-text");
const cancelReplyBtn = document.getElementById("cancel-reply-btn");

// ─── App State ───────────────────────────────────────────────────────────────
let currentUser        = null;
let currentChatId      = null;
let currentPartnerUid  = null;
let currentPartnerCode = null;

let unsubscribeMessages = null;
let unsubscribeContacts = null;
let unsubscribeInbox    = null;
let unsubscribeTyping   = null;
let unsubscribePartnerPresence = null;

let replyingTo = null; // Tracks the message being replied to
let editingMessageId = null; // Tracks the message being edited

// Fix 1: keyed DOM nodes so we update in-place instead of full re-render
const messageElements = new Map(); // msgId → bubble element

// Fix 2: track which messages we've already marked read to avoid redundant writes
const markedAsRead = new Set();

const presenceListeners = new Map();
let typingTimeout = null;
const TYPING_TIMEOUT_MS = 2500;

// ─── Utility Helpers ─────────────────────────────────────────────────────────
function generateUserCode() {
  return Math.random().toString(36).substring(2, 8);
}

function formatTime(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function getChatId(uid1, uid2) {
  return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
}

function clearError(el) {
  el.innerText = "";
}

// ─── Presence & Tab Management ────────────────────────────────────────────────
function isActivelyOnTab() {
  return document.visibilityState === "visible" && document.hasFocus();
}

function writePresence(online) {
  if (!currentUser) return;
  setDoc(doc(db, "users", currentUser.uid), { online }, { merge: true });
}

function updatePresence() {
  writePresence(isActivelyOnTab());
  // If user returns to tab, mark pending messages as read
  if (isActivelyOnTab() && currentChatId) {
    markMessagesAsRead(currentChatId);
  }
}

document.addEventListener("visibilitychange", updatePresence);
window.addEventListener("focus", updatePresence);
window.addEventListener("blur", updatePresence);
window.addEventListener("beforeunload", () => writePresence(false));

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

    requestNotificationPermission(); 

    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists()) {
      userCodeDisplay.innerText = userDoc.data().code;
    }

    loadContacts();
    updatePresence(); 
  } else {
    currentUser        = null;
    currentChatId      = null;
    currentPartnerUid  = null;
    currentPartnerCode = null;

    writePresence(false);

    unsubscribeContacts?.();
    unsubscribeInbox?.();
    unsubscribeMessages?.();
    unsubscribeTyping?.();
    unsubscribePartnerPresence?.();

    presenceListeners.forEach(unsub => unsub());
    presenceListeners.clear();
    
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

// Shared state for both listeners so either can trigger a re-render
let _contactsMap = new Map(); // uid → code  (manually added)
let _inboxMap    = new Map(); // uid → code  (messaged you, not yet added)

function loadContacts() {
  unsubscribeContacts?.();
  unsubscribeInbox?.();
  _contactsMap = new Map();
  _inboxMap    = new Map();

  // ── Listener 1: manually added contacts ──────────────────────────────────
  // No orderBy — avoids Firestore index errors on the subcollection
  unsubscribeContacts = onSnapshot(
    collection(db, "users", currentUser.uid, "contacts"),
    async (snap) => {
      _contactsMap = new Map();
      const fetches = snap.docs.map(async (docSnap) => {
        const { uid } = docSnap.data();
        try {
          const userRef = await getDoc(doc(db, "users", uid));
          _contactsMap.set(uid, userRef.exists() ? userRef.data().code : "Unknown");
        } catch (e) { console.error("Contact fetch error:", e); }
      });
      await Promise.all(fetches);
      renderContactsList(_contactsMap, _inboxMap);
    },
    (err) => console.error("Contacts listener error:", err)
  );

  // ── Listener 2: inbox (people who texted you) ─────────────────────────────
  unsubscribeInbox = onSnapshot(
    collection(db, "users", currentUser.uid, "inbox"),
    async (snap) => {
      _inboxMap = new Map();
      const fetches = snap.docs.map(async (inboxDoc) => {
        const senderUid = inboxDoc.id;
        if (!_contactsMap.has(senderUid)) {
          try {
            const userRef = await getDoc(doc(db, "users", senderUid));
            _inboxMap.set(senderUid, userRef.exists() ? userRef.data().code : senderUid);
          } catch (e) { console.error("Inbox fetch error:", e); }
        }
      });
      await Promise.all(fetches);
      renderContactsList(_contactsMap, _inboxMap);
    },
    (err) => console.error("Inbox listener error:", err)
  );
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

  const nameRow = document.createElement("div");
  nameRow.classList.add("contact-name-row");

  const dot = document.createElement("span");
  dot.classList.add("presence-dot");
  nameRow.appendChild(dot);

  const nameSpan = document.createElement("span");
  nameSpan.innerText = code;
  nameRow.appendChild(nameSpan);

  item.appendChild(nameRow);

  presenceListeners.get(uid)?.(); 
  const unsub = onSnapshot(doc(db, "users", uid), (snap) => {
    if (snap.exists() && snap.data().online === true) {
      dot.classList.add("online");
      dot.title = "Online";
    } else {
      dot.classList.remove("online");
      dot.title = "Offline";
    }
  });
  presenceListeners.set(uid, unsub);

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

  markedAsRead.clear(); // Fix 2: reset per-session read-tracking for new chat

  noChatSelected.classList.add("hidden");
  activeChatWindow.classList.remove("hidden");
  chatWithHeader.innerText = partnerCode;
  
  unsubscribePartnerPresence?.();
  headerPresenceDot.className = ""; 
  unsubscribePartnerPresence = onSnapshot(doc(db, "users", partnerUid), (snap) => {
    if (snap.exists() && snap.data().online === true) {
      headerPresenceDot.classList.add("online");
    } else {
      headerPresenceDot.classList.remove("online");
    }
  });

  openChatView();
  loadMessages();
  listenForTyping();
  cancelReply(); // Reset reply state when switching chats
}

// ─── Messaging ───────────────────────────────────────────────────────────────

// ── Fix 1: Build a bubble once; update it in-place on changes ────────────────

function buildReceiptEl(readBy) {
  const receipt = document.createElement("span");
  receipt.classList.add("read-receipt");
  refreshReceiptEl(receipt, readBy);
  return receipt;
}

function refreshReceiptEl(receipt, readBy) {
  const partnerReadTime = readBy?.[currentPartnerUid];
  receipt.innerText = partnerReadTime ? ` • Read ${formatTime(partnerReadTime)}` : ` • Delivered`;
  receipt.classList.toggle("is-read", !!partnerReadTime);
}

function buildReactionsEl(msgId, reactions) {
  const container = document.createElement("div");
  container.classList.add("message-reactions");
  refreshReactionsEl(container, msgId, reactions);
  return container;
}

function refreshReactionsEl(container, msgId, reactions) {
  container.innerHTML = "";
  if (!reactions) return;
  Object.entries(reactions).forEach(([emoji, uids]) => {
    if (!uids || uids.length === 0) return;
    const badge = document.createElement("div");
    badge.classList.add("reaction-badge");
    if (uids.includes(currentUser.uid)) badge.classList.add("my-reaction");
    badge.innerHTML = `<span>${emoji}</span> <small>${uids.length}</small>`;
    badge.onclick = (e) => { e.stopPropagation(); toggleReaction(msgId, emoji, reactions); };
    container.appendChild(badge);
  });
}

function createMessageBubble(msgId, msg, isSent) {
  const bubble = document.createElement("div");
  bubble.classList.add("message", isSent ? "sent" : "received");
  bubble.dataset.id = msgId;
  bubble.ondblclick = () => setupReply(msg.text, isSent ? "You" : currentPartnerCode);

  const bubbleContent = document.createElement("div");
  bubbleContent.classList.add("message-content");

  if (msg.replyTo) {
    const replyQuote = document.createElement("div");
    replyQuote.classList.add("reply-quote");
    replyQuote.innerHTML = `<small>${msg.replyTo.senderCode}</small><p>${msg.replyTo.text}</p>`;
    bubbleContent.appendChild(replyQuote);
  }

  const textSpan = document.createElement("span");
  textSpan.classList.add("message-text");
  textSpan.innerText = msg.text;
  bubbleContent.appendChild(textSpan);

  bubbleContent.appendChild(buildReactionsEl(msgId, msg.reactions));

  const infoDiv = document.createElement("div");
  infoDiv.classList.add("message-info");

  const editedSpan = document.createElement("span");
  editedSpan.classList.add("edited-indicator");
  editedSpan.innerText = msg.edited ? "edited" : "";
  infoDiv.appendChild(editedSpan);

  const timeSpan = document.createElement("span");
  timeSpan.innerText = formatTime(msg.createdAt);
  infoDiv.appendChild(timeSpan);

  if (isSent) infoDiv.appendChild(buildReceiptEl(msg.readBy));

  bubbleContent.appendChild(infoDiv);
  bubble.appendChild(bubbleContent);
  return bubble;
}

function updateMessageBubble(bubble, msgId, msg, isSent) {
  const content = bubble.querySelector(".message-content");

  // Text may change on edit
  const textSpan = content.querySelector(".message-text");
  if (textSpan) textSpan.innerText = msg.text;

  // "edited" label
  const editedSpan = content.querySelector(".edited-indicator");
  if (editedSpan) editedSpan.innerText = msg.edited ? "edited" : "";

  // Reactions — refresh the existing container
  const reactionsEl = content.querySelector(".message-reactions");
  if (reactionsEl) refreshReactionsEl(reactionsEl, msgId, msg.reactions);

  // Read receipt — only on sent messages
  if (isSent) {
    const receipt = content.querySelector(".read-receipt");
    if (receipt) refreshReceiptEl(receipt, msg.readBy);
  }

  // Keep dblclick handler in sync (text may have changed)
  bubble.ondblclick = () => setupReply(msg.text, isSent ? "You" : currentPartnerCode);
}

function loadMessages() {
  if (!currentChatId) return;
  unsubscribeMessages?.();
  messagesDiv.innerHTML = "";
  messageElements.clear();

  const q = query(collection(db, "chats", currentChatId, "messages"), orderBy("createdAt"));

  unsubscribeMessages = onSnapshot(q, (snapshot) => {
    let didAddMessages = false;
    let lastNewIncomingMsg = null;

    snapshot.docChanges().forEach((change) => {
      const docSnap = change.doc;
      const msg = docSnap.data();
      const isSent = msg.sender === currentUser.uid;

      if (change.type === "added") {
        const bubble = createMessageBubble(docSnap.id, msg, isSent);
        messageElements.set(docSnap.id, bubble);
        messagesDiv.appendChild(bubble);
        didAddMessages = true;
        if (!isSent && !snapshot.metadata.hasPendingWrites) {
          lastNewIncomingMsg = msg; // track for notification + read-marking
        }
      } else if (change.type === "modified") {
        const existing = messageElements.get(docSnap.id);
        if (existing) updateMessageBubble(existing, docSnap.id, msg, isSent);
      } else if (change.type === "removed") {
        const existing = messageElements.get(docSnap.id);
        if (existing) { existing.remove(); messageElements.delete(docSnap.id); }
      }
    });

    if (didAddMessages) messagesDiv.scrollTop = messagesDiv.scrollHeight;

    // Fix 2: only fire read-marking when a new incoming message actually arrived
    if (lastNewIncomingMsg) {
      sendLocalNotification(currentPartnerCode, lastNewIncomingMsg.text);
      markMessagesAsRead(currentChatId);
    }
  });
}
// Fix 2: batch writes + per-session dedup so we never write the same doc twice
async function markMessagesAsRead(chatId) {
  if (!isActivelyOnTab() || !currentUser) return;

  const q = query(
    collection(db, "chats", chatId, "messages"),
    where("sender", "!=", currentUser.uid)
  );

  const snap = await getDocs(q);
  const batch = writeBatch(db);
  let hasUpdates = false;

  snap.forEach((docSnap) => {
    if (markedAsRead.has(docSnap.id)) return; // already written this session
    const readBy = docSnap.data().readBy;
    if (!readBy?.[currentUser.uid]) {
      batch.update(docSnap.ref, { [`readBy.${currentUser.uid}`]: Date.now() });
      markedAsRead.add(docSnap.id);
      hasUpdates = true;
    }
  });

  if (hasUpdates) await batch.commit();
}

sendBtn.onclick = async () => {
  if (!currentChatId || !messageInput.value.trim()) return;
  const text = messageInput.value.trim();
  messageInput.value = "";

  // ── Edit mode: update existing message ─────────────────────────────────
  if (editingMessageId) {
    const msgRef = doc(db, "chats", currentChatId, "messages", editingMessageId);
    await updateDoc(msgRef, { text, edited: true });
    cancelReply();
    return;
  }

  // ── Normal send ─────────────────────────────────────────────────────────
  const messageData = {
    text,
    sender: currentUser.uid,
    createdAt: Date.now(),
    readBy: {}
  };

  if (replyingTo) {
    messageData.replyTo = replyingTo;
    cancelReply();
  }

  await addDoc(collection(db, "chats", currentChatId, "messages"), messageData);

  await setDoc(doc(db, "users", currentPartnerUid, "inbox", currentUser.uid), {
    lastMessageAt: Date.now(),
    senderUid: currentUser.uid
  }, { merge: true });
};

messageInput.onkeypress = (e) => { if (e.key === "Enter") sendBtn.click(); };

// ─── Reply Logic ─────────────────────────────────────────────────────────────

function setupReply(text, senderCode) {
  replyingTo = { text, senderCode };
  replyLabel.innerText = `Replying to ${senderCode}`;
  replyText.innerText = text;
  replyBar.classList.remove("hidden");
  messageInput.focus();
}

function cancelReply() {
  replyingTo = null;
  editingMessageId = null;
  replyBar.classList.remove("is-editing");
  replyBar.classList.add("hidden");
  messageInput.value = "";
}

cancelReplyBtn.onclick = cancelReply;

// ─── Edit & Delete Logic ──────────────────────────────────────────────────────

function startEditMessage(msgId, currentText) {
  replyingTo = null; // Clear any active reply
  editingMessageId = msgId;
  replyLabel.innerText = "Editing message";
  replyText.innerText = currentText;
  replyBar.classList.remove("hidden");
  replyBar.classList.add("is-editing");
  messageInput.value = currentText;
  messageInput.focus();
  messageInput.select();
}

async function deleteMessage(msgId) {
  if (!currentChatId) return;
  if (!confirm("Delete this message?")) return;
  try {
    await deleteDoc(doc(db, "chats", currentChatId, "messages", msgId));
  } catch (err) {
    console.error("Delete failed:", err);
  }
}

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
      typingIndicator.classList.remove("hidden");
    } else {
      typingIndicator.classList.add("hidden");
    }
  });
}

// ─── Notification Setup ───────────────────────────────────────────────────────

async function requestNotificationPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") {
    await Notification.requestPermission();
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/firebase-messaging-sw.js')
    .then(() => console.log("Service Worker Active"));
}

function sendLocalNotification(user, text) {
  if (Notification.permission === "granted" && document.visibilityState !== "visible") {
    new Notification(`Pulse: ${user}`, { body: text });
  }
}

let reactionTargetId = null;
let reactionTargetIsSent = false;
const reactionPicker = document.getElementById("reaction-picker");
const msgActions = document.getElementById("msg-actions");
const editMsgBtn = document.getElementById("edit-msg-btn");
const deleteMsgBtn = document.getElementById("delete-msg-btn");

// 1. Show picker on Context Menu (Right Click) or Long Press
document.addEventListener("contextmenu", (e) => {
  const bubble = e.target.closest(".message");
  if (bubble) {
    e.preventDefault();
    const msgId = bubble.dataset.id;
    const isSent = bubble.classList.contains("sent");
    showReactionPicker(msgId, isSent, e.clientX, e.clientY);
  } else {
    reactionPicker.classList.add("hidden");
  }
});

function showReactionPicker(msgId, isSent, x, y) {
  reactionTargetId = msgId;
  reactionTargetIsSent = isSent;

  // Show edit/delete only for own messages
  if (isSent) {
    msgActions.classList.remove("hidden");
  } else {
    msgActions.classList.add("hidden");
  }

  // Position: keep it on screen
  const menuWidth = 190;
  const menuHeight = isSent ? 160 : 70;
  reactionPicker.style.left = `${Math.min(x, window.innerWidth - menuWidth)}px`;
  reactionPicker.style.top  = `${Math.max(10, y - menuHeight)}px`;
  reactionPicker.classList.remove("hidden");
}

// Edit button
editMsgBtn.onclick = () => {
  if (!reactionTargetId || !currentChatId) return;
  reactionPicker.classList.add("hidden");
  // Find the text from the rendered bubble
  const bubble = document.querySelector(`.message[data-id="${reactionTargetId}"]`);
  const text = bubble?.querySelector(".message-text")?.innerText || "";
  startEditMessage(reactionTargetId, text);
};

// Delete button
deleteMsgBtn.onclick = () => {
  if (!reactionTargetId) return;
  reactionPicker.classList.add("hidden");
  deleteMessage(reactionTargetId);
};

// 2. Handle Emoji Click
document.querySelectorAll(".reaction-btn").forEach(btn => {
  btn.onclick = async () => {
    const emoji = btn.getAttribute("data-emoji");
    if (!reactionTargetId || !currentChatId) return;

    // Get the current document to see existing reactions
    const msgRef = doc(db, "chats", currentChatId, "messages", reactionTargetId);
    const msgSnap = await getDoc(msgRef);
    const currentReactions = msgSnap.data().reactions || {};

    toggleReaction(reactionTargetId, emoji, currentReactions);
    reactionPicker.classList.add("hidden");
  };
});

// 3. Toggle Logic (Add if not there, Remove if is)
async function toggleReaction(msgId, emoji, currentReactions) {
  const msgRef = doc(db, "chats", currentChatId, "messages", msgId);
  let uids = currentReactions[emoji] || [];

  if (uids.includes(currentUser.uid)) {
    // Remove reaction
    uids = uids.filter(id => id !== currentUser.uid);
  } else {
    // Add reaction
    uids.push(currentUser.uid);
  }

  await updateDoc(msgRef, {
    [`reactions.${emoji}`]: uids
  });
}

// Close picker when clicking away
document.addEventListener("click", (e) => {
  if (!e.target.closest(".reaction-picker")) {
    reactionPicker.classList.add("hidden");
  }
});
