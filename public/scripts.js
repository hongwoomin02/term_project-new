// scripts.js

let nickname = '';
const socket = new WebSocket('ws://localhost:3000');

socket.onopen = () => {
    console.log('Connected to server');
};


socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    
    switch (data.type) {
        case "playerList":
            updatePlayerList(data.players);
            break;
        case "status":
            document.getElementById('status').innerText = data.message;
            break;
        case "chat":
            displayChatMessage(data.nickname, data.message);
            break;
        case "timer":
            updateTimer(data.timeLeft);
            break;
        case "role":
            setRole(data);
            break;
        case "alert":
            alert(data.message);
            break;
        case "system":
            displaySystemMessage(data.message);
            break;
    }
};
function displaySystemMessage(message) {
    const chatMessages = document.getElementById('chatMessages');
    const messageElement = document.createElement('div');
    messageElement.innerText = `System: ${message}`;
    messageElement.style.color = "red";  // 빨간색으로 표시
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function updatePlayerList(players) {
    const playerListElement = document.getElementById('playerList');
    playerListElement.innerHTML = ""; 
    players.forEach(player => {
        const listItem = document.createElement('div');
        listItem.innerText = player;
        playerListElement.appendChild(listItem);
    });
}
function setNickname() {
    const input = document.getElementById('nicknameInput');
    nickname = input.value.trim();

    socket.send(JSON.stringify({ type: "setNickname", nickname }));

    document.getElementById('nicknameSection').classList.add('hidden');
    document.getElementById('gameContainer').classList.remove('hidden');
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
function setRole(data) {
    const roleText = document.getElementById('roleText');
    const roleImage = document.getElementById('roleImage');
    
    roleText.innerText = data.message;
    if (data.role === "mafia") {
        roleImage.src = "images/mafia.png"; 
        document.getElementById('killButton').classList.remove('hidden');
    } else {
        roleImage.src = "images/citizen.png"; 
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
        socket.send(JSON.stringify({ type: "vote" , voter: nickname, target: vote }));
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

