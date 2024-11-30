// scripts.js

let playerRole = null;
let nickname = '';
let gamePhase = "아침"; 
const socket = new WebSocket('ws://localhost:3000');

socket.onopen = () => {
    console.log('Connected to server');
};


socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    //이거 아마 상태창이라 phase랑 합칠수 있을듯?? ++++++++
    switch (data.type) {
        case "phase":
            updatePhaseIndicator(data.message); // 단계 전환 메시지 업데이트
            gamePhase = data.message.includes("밤") ? "밤" : "아침"; // 게임 단계 업데이트
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
            setRole(data.role);
        case "playerList":
            updatePlayerList(data.players);
            break;

        case "eliminated":
            handleElimination(data.message);
            break;

        case "gameEnd": // 오타 "gaemEnd" 수정
            handleGameEnd(data.winner, data.message);
            break;
        case "error":
            alert(data.message);
            break;
        
    }
};

function handleGameEnd(winner, message) {
    alert(message); // 알림창 표시
    const statusElement = document.getElementById('status');
    statusElement.innerText = `게임종료! ${winner}팀 승리!`;
    resetUI(); // UI 초기화
}


function resetUI() {
    // 게임 관련 UI 요소 초기화
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = ""; // 채팅창 초기화
    const playerList = document.getElementById('playerList');
    playerList.innerHTML = ""; // 플레이어 목록 초기화
    const roleText = document.getElementById('roleText');
    roleText.innerText = "Waiting for a new game...";
}

function handleElimination(message) {
    alert(message); // 팝업 메시지로 제거 안내
    displayChatMessage("System", message);
    const statusElement = document.getElementById('status');
    statusElement.innerText = "당신은 제거되었습니다.연결이 종료됩니다...";
    socket.close(); // 클라이언트 연결 종료
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
// 이거 내생각에 조금 손봐야할듯  ++++++++
function updatePhaseIndicator(phaseMessage) {
    const statusElement = document.getElementById('status');
    statusElement.innerText = phaseMessage;
}

// Set nickname and join the game
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
function setRole(role) {
    playerRole = role;
    const roleText = document.getElementById('roleText');
    const roleImage = document.getElementById('roleImage');

    if (role === "mafia") {
        roleText.innerText = "당신은 마피아입니다.";
        roleImage.src = "images/mafia.png"; // Replace with actual Mafia image URL
        document.getElementById('killButton').classList.remove('hidden');
    } else {
        roleText.innerText = "당신은 시민입니다.";
        roleImage.src = "images/citizen.png"; // Replace with actual Citizen image URL
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

