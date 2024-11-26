// scripts.js

let playerRole = null;
let nickname = '';
let gamePhase = "day"; // 'day' or 'night'
let playersReady = false;
const socket = new WebSocket('ws://localhost:3000');

// When the client successfully connects to the server
socket.onopen = () => {
    console.log('Connected to server');
    document.getElementById('status').innerText = 'Connected to server';
};

socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "status") {
        document.getElementById('status').innerText = data.message;

        // Check if game is ready to start
        if (data.message.includes("5/5 players")) {
            playersReady = true;
        }
    } else if (data.type === "timer" && playersReady) {
        updateTimer(data.timeLeft); // Only update timer if all players are ready
    }
};
// Handle incoming messages from the server
socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log("Received message:", data);

    if (data.type === "welcome" || data.type === "status") {
        document.getElementById('status').innerText = data.message;
    } else if (data.type === "role") {
        setRole(data.role);
    } else if (data.type === "chat") {
        displayChatMessage(data.nickname, data.message);
    }else if (data.type === "timer") {
        updateTimer(data.timeLeft);
    }
};

// Set nickname and join the game
function setNickname() {
    const input = document.getElementById('nicknameInput');
    nickname = input.value.trim();

    if (nickname) {
        // Send nickname to the server
        socket.send(JSON.stringify({ type: "setNickname", nickname }));

        // Hide nickname section and show game container
        document.getElementById('nicknameSection').classList.add('hidden');
        document.getElementById('gameContainer').classList.remove('hidden');
    } else {
        alert("Please enter a valid nickname!");
    }
}

// Display a chat message
function displayChatMessage(sender, message) {
    const chatMessages = document.getElementById('chatMessages');
    const messageElement = document.createElement('div');
    messageElement.innerText = `${sender}: ${message}`;
    chatMessages.appendChild(messageElement);

 
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
}


// Set player role and update UI
function setRole(role) {
    playerRole = role;
    const roleText = document.getElementById('roleText');
    const roleImage = document.getElementById('roleImage');

    if (role === "mafia") {
        roleText.innerText = "You are a Mafia!";
        roleImage.src = "mafia-image.jpg"; // Replace with actual Mafia image URL
        document.getElementById('killButton').classList.remove('hidden');
    } else {
        roleText.innerText = "You are a Citizen!";
        roleImage.src = "citizen-image.jpg"; // Replace with actual Citizen image URL
    }
}

// Send a chat message
function sendChat() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();

    if (message) {
        socket.send(JSON.stringify({ type: "chat", nickname, message }));
        input.value = ''; // Clear the input field
    }
}

// Send a vote
function sendVote() {
    const input = document.getElementById('voteInput');
    const vote = input.value.trim();

    if (vote) {
        const type = playerRole === "mafia" && gamePhase === "night" ? "mafiaVote" : "vote";
        socket.send(JSON.stringify({ type, voter: nickname, target: vote }));
        input.value = ''; // Clear the input field
    }
}

// Send a kill action (for Mafia)
function sendKill() {
    const input = document.getElementById('voteInput');
    const target = input.value.trim();

    if (target) {
        socket.send(JSON.stringify({ type: "kill", voter: nickname, target }));
        input.value = ''; // Clear the input field
    }
}
// Update the timer display
function updateTimer(timeLeft) {
    const timerElement = document.getElementById('timer');
    const timerDisplay = document.getElementById('timerDisplay');

    // Update the timer text
    timerDisplay.innerText = `${timeLeft}s`;

    // If hidden, make it visible
    if (timerElement.classList.contains('hidden')) {
        timerElement.classList.remove('hidden');
    }
}
