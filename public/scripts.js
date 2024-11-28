// scripts.js

let playerRole = null;
let nickname = '';
let gamePhase = "아침"; // 'day' or 'night'
const socket = new WebSocket('ws://localhost:3000');

// When the client successfully connects to the server
socket.onopen = () => {
    console.log('Connected to server');
};

// Handle incoming messages from the server
socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "phase") {
        updatePhaseIndicator(data.message); // 단계 전환 메시지 업데이트
        gamePhase = data.message.includes("밤") ? "밤" : "아침"; // 게임 단계 업데이트
    } else if (data.type === "status") {
        if (data.message.includes("현재 게임이 진행 중입니다")) {
            handleGameInProgress(data.message);
        } else {
            document.getElementById('status').innerText = data.message;
        }
    } else if (data.type === "role") {
        setRole(data.role);
    } else if (data.type === "chat") {
        displayChatMessage(data.nickname, data.message);
    } else if (data.type === "timer") {
        updateTimer(data.timeLeft);
    } else if (data.type === "playerList") {
        updatePlayerList(data.players);
    } else  if (data.type === "eliminated") {
        handleElimination(data.message);
    } else if (data.type === "gameOver") {
        handleGameOver(data.message);
    } else if(data.type ==="gaemEnd"){
        handleGameEnd(data.winner, data.message);
    }
};

function handleGameEnd(winner, message) {
    alert(message); // 알림창 표시
    const statusElement = document.getElementById('status');
    statusElement.innerText = `Game Over! ${winner} team wins.`;
    resetUI(); // UI 초기화
}
function handleGameInProgress(message) {
    const statusElement = document.getElementById('status');
    statusElement.innerText = message;

    const joinButton = document.getElementById('joinButton');
    const nicknameInput = document.getElementById('nicknameInput');

    if (joinButton) {
        joinButton.disabled = true; // 버튼 비활성화
        joinButton.innerText = "게임 진행 중";
    }
    if (nicknameInput) {
        nicknameInput.disabled = true; // 닉네임 입력 비활성화
    }
}
function handleGameOver(message) {
    alert(message); // 게임 종료 메시지 표시
    const statusElement = document.getElementById('status');
    statusElement.innerText = "게임이 종료되었습니다. 다음 라운드를 기다려주세요.";

    const joinButton = document.getElementById('joinButton');
    const nicknameInput = document.getElementById('nicknameInput');

    if (joinButton) {
        joinButton.disabled = false; // 버튼 활성화
        joinButton.innerText = "게임 입장";
    }
    if (nicknameInput) {
        nicknameInput.disabled = false; // 닉네임 입력 활성화
    }

    resetUI();
}

function resetUI() {
    // 게임 관련 UI 요소 초기화
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = ""; // 채팅창 초기화
    const playerList = document.getElementById('playerList');
    playerList.innerHTML = ""; // 플레이어 목록 초기화
    const roleText = document.getElementById('roleText');
    roleText.innerText = "Waiting for a new game...";
    const joinButton = document.getElementById('joinButton');
    if (joinButton) {
        joinButton.disabled = false; // 버튼 활성화
        joinButton.innerText = "Join Game";
    }
}
function handleElimination(message) {
    alert(message); // 팝업 메시지로 제거 안내
    const statusElement = document.getElementById('status');
    statusElement.innerText = "You have been eliminated. Disconnecting...";
    socket.close(); // 클라이언트 연결 종료
}
function disableJoinButton() {
    const joinButton = document.getElementById('joinButton');
    if (joinButton) {
        joinButton.disabled = true;
        joinButton.innerText = "Game in progress";
    }
}
function updatePlayerList(players) {
    const playerListElement = document.getElementById('playerList');
    playerListElement.innerHTML = ""; // 기존 목록 초기화
    players.forEach(player => {
        const listItem = document.createElement('div');
        listItem.innerText = player;
        playerListElement.appendChild(listItem);
    });
}
function updatePhaseIndicator(phaseMessage) {
    const statusElement = document.getElementById('status');
    statusElement.innerText = phaseMessage;
}
// Set nickname and join the game
function setNickname() {
    const input = document.getElementById('nicknameInput');
    nickname = input.value.trim();

    socket.send(JSON.stringify({ type: "setNickname", nickname }));

        // Hide nickname section and show game container
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
        roleImage.src = "mafia.png"; // Replace with actual Mafia image URL
        document.getElementById('killButton').classList.remove('hidden');
    } else {
        roleText.innerText = "당신은 시민입니다.";
        roleImage.src = "citizen.png"; // Replace with actual Citizen image URL
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
        const type = playerRole === "mafia" && gamePhase === "밤" ? "mafiaVote" : "vote";
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

