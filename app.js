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

function loadContacts() {
  unsubscribeContacts?.();
  unsubscribeInbox?.();

  const contactsRef = collection(db, "users", currentUser.uid, "contacts");
  const inboxRef = collection(db, "users", currentUser.uid, "inbox");

  unsubscribeContacts = onSnapshot(query(contactsRef, orderBy("addedAt", "asc")), async (contactsSnap) => {
    const manualContacts = new Map();
    for (const docSnap of contactsSnap.docs) {
      const { uid } = docSnap.data();
      const userRef = await getDoc(doc(db, "users", uid));
      manualContacts.set(uid, userRef.exists() ? userRef.data().code : "Unknown");
    }

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

function loadMessages() {
  if (!currentChatId) return;
  unsubscribeMessages?.();

  const q = query(collection(db, "chats", currentChatId, "messages"), orderBy("createdAt"));

  unsubscribeMessages = onSnapshot(q, (snapshot) => {
    const hasChanges = snapshot.docChanges().length > 0;
    const isLocalUpdate = snapshot.metadata.hasPendingWrites;

    messagesDiv.innerHTML = "";
    
    snapshot.forEach((docSnap) => {
      const msg = docSnap.data();
      const isSent = msg.sender === currentUser.uid;

      if (hasChanges && !isLocalUpdate && !isSent && docSnap.id === snapshot.docs[snapshot.docs.length - 1].id) {
        sendLocalNotification(currentPartnerCode, msg.text);
      }

      // 1. Create bubble and link the ID for reactions
      const bubble = document.createElement("div");
      bubble.classList.add("message", isSent ? "sent" : "received");
      bubble.dataset.id = docSnap.id; 

      bubble.ondblclick = () => {
        setupReply(msg.text, isSent ? "You" : currentPartnerCode);
      };

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

      // --- REACTIONS (NOW INSIDE THE LOOP) ---
      if (msg.reactions) {
        const reactionsDiv = document.createElement("div");
        reactionsDiv.classList.add("message-reactions");
        
        Object.entries(msg.reactions).forEach(([emoji, uids]) => {
          if (!uids || uids.length === 0) return;
          
          const badge = document.createElement("div");
          badge.classList.add("reaction-badge");
          if (uids.includes(currentUser.uid)) badge.classList.add("my-reaction");
          
          badge.innerHTML = `<span>${emoji}</span> <small>${uids.length}</small>`;
          badge.onclick = (e) => {
            e.stopPropagation(); 
            toggleReaction(docSnap.id, emoji, msg.reactions);
          };
          
          reactionsDiv.appendChild(badge);
        });
        bubbleContent.appendChild(reactionsDiv);
      }

      const infoDiv = document.createElement("div");
      infoDiv.classList.add("message-info");
      const timeSpan = document.createElement("span");
      timeSpan.innerText = formatTime(msg.createdAt);
      infoDiv.appendChild(timeSpan);

      if (isSent) {
        const partnerReadTime = msg.readBy && msg.readBy[currentPartnerUid];
        const receipt = document.createElement("span");
        receipt.classList.add("read-receipt");
        receipt.innerText = partnerReadTime ? ` • Read ${formatTime(partnerReadTime)}` : ` • Delivered`;
        if (partnerReadTime) receipt.classList.add("is-read");
        infoDiv.appendChild(receipt);
      }

      bubbleContent.appendChild(infoDiv);
      bubble.appendChild(bubbleContent);
      messagesDiv.appendChild(bubble);
    });

    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    markMessagesAsRead(currentChatId);
  });
}
async function markMessagesAsRead(chatId) {
  if (!isActivelyOnTab() || !currentUser) return;

  const q = query(
    collection(db, "chats", chatId, "messages"),
    where("sender", "!=", currentUser.uid)
  );

  const snap = await getDocs(q);
  snap.forEach((docSnap) => {
    const msg = docSnap.data();
    if (!msg.readBy?.[currentUser.uid]) {
      updateDoc(docSnap.ref, { [`readBy.${currentUser.uid}`]: Date.now() });
    }
  });
}

sendBtn.onclick = async () => {
  if (!currentChatId || !messageInput.value.trim()) return;
  const text = messageInput.value.trim();
  messageInput.value = "";

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
  replyBar.classList.add("hidden");
}

cancelReplyBtn.onclick = cancelReply;

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
const reactionPicker = document.getElementById("reaction-picker");

// 1. Show picker on Context Menu (Right Click) or Long Press
document.addEventListener("contextmenu", (e) => {
  const bubble = e.target.closest(".message");
  if (bubble) {
    e.preventDefault(); // Prevent default browser menu
    
    // Find the actual message ID from the UI (we'll need to store it on the bubble)
    // For now, let's attach the ID to the bubble element during rendering
    const msgId = bubble.dataset.id; 
    showReactionPicker(msgId, e.clientX, e.clientY);
  } else {
    reactionPicker.classList.add("hidden");
  }
});

function showReactionPicker(msgId, x, y) {
  reactionTargetId = msgId;
  reactionPicker.style.left = `${Math.min(x, window.innerWidth - 180)}px`;
  reactionPicker.style.top = `${y - 60}px`;
  reactionPicker.classList.remove("hidden");
}

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
