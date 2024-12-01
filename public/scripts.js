// 현재 사용자의 닉네임
let nickname = '';

// WebSocket 서버와 연결 설정
const socket = new WebSocket('ws://localhost:3000');

// WebSocket 연결이 성공적으로 열렸을 때 호출
socket.onopen = () => {
    console.log('Connected to server');
};

// 서버로부터 메시지를 수신했을 때 처리
socket.onmessage = (event) => {
    const data = JSON.parse(event.data); // JSON 형식으로 수신된 데이터를 파싱

    // 수신된 데이터의 유형에 따라 동작 수행
    switch (data.type) {
        case "playerList":
            updatePlayerList(data.players); // 플레이어 목록 업데이트
            break;
        case "status":
            document.getElementById('status').innerText = data.message; // 상태 메시지 표시
            break;
        case "chat":
            displayChatMessage(data.nickname, data.message); // 채팅 메시지 표시
            break;
        case "timer":
            updateTimer(data.timeLeft); // 남은 시간 업데이트
            break;
        case "role":
            setRole(data); // 플레이어 역할 설정
            break;
        case "alert":
            alert(data.message); // 경고 메시지 팝업
            break;
        case "system":
            displaySystemMessage(data.message); // 시스템 메시지 표시
            break;
    }
};

// 시스템 메시지를 채팅창에 표시
function displaySystemMessage(message) {
    const chatMessages = document.getElementById('chatMessages');
    const messageElement = document.createElement('div');
    messageElement.innerText = `System: ${message}`;
    messageElement.style.color = "red"; // 빨간색으로 강조
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight; // 채팅창 스크롤을 최신 메시지로 이동
}
// 채팅 메시지를 UI에 표시
function displayChatMessage(sender, message) {
    const chatMessages = document.getElementById('chatMessages');
    const messageElement = document.createElement('div');
    messageElement.innerText = `${sender}: ${message}`; // 보낸 사람과 메시지 내용 표시
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight; // 채팅창 스크롤을 최신 메시지로 이동
}

// 플레이어 목록을 UI에 업데이트
function updatePlayerList(players) {
    const playerListElement = document.getElementById('playerList');
    playerListElement.innerHTML = ""; // 기존 목록 초기화
    players.forEach(player => {
        const listItem = document.createElement('div');
        listItem.innerText = player; // 플레이어 이름 추가
        playerListElement.appendChild(listItem);
    });
}

// 닉네임을 설정하고 서버에 전송
function setNickname() {
    const input = document.getElementById('nicknameInput');
    nickname = input.value.trim(); // 입력 필드에서 닉네임 읽기

    // 닉네임을 서버에 전송
    socket.send(JSON.stringify({ type: "setNickname", nickname }));

    // UI 전환: 닉네임 입력창 숨기고 게임 컨테이너 표시
    document.getElementById('nicknameSection').classList.add('hidden');
    document.getElementById('gameContainer').classList.remove('hidden');
    document.getElementById("background").classList.add("hidden");
}

// 플레이어 역할 이미지를 설정하고 UI를 업데이트
function setRole(data) {
    const roleText = document.getElementById('roleText');
    const roleImage = document.getElementById('roleImage');

    roleText.innerText = data.message; // 역할에 따른 메시지 표시
    if (data.role === "mafia") {
        roleImage.src = "images/mafia.png"; // 마피아 역할일 경우 이미지 설정
        document.getElementById('killButton').classList.remove('hidden'); // 마피아 전용 버튼 표시
    } else {
        roleImage.src = "images/citizen.png"; // 시민 역할 이미지 설정
    }
}

// 채팅 메시지를 서버로 전송
function sendChat() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim(); // 입력 필드에서 메시지 읽기

    if (message) {
        // 메시지를 서버로 전송
        socket.send(JSON.stringify({ type: "chat", nickname, message }));
        input.value = ''; // 입력 필드 초기화
    }
}

// 투표를 서버로 전송
function sendVote() {
    const input = document.getElementById('voteInput');
    const vote = input.value.trim();

    if (vote) {
        // 투표 정보를 서버로 전송
        socket.send(JSON.stringify({ type: "vote", voter: nickname, target: vote }));
        input.value = ''; // 입력 필드 초기화
    }
}

// 마피아의 살해 명령을 서버로 전송
function sendKill() {
    const input = document.getElementById('voteInput');
    const target = input.value.trim();

    if (target) {
        // 살해 정보를 서버로 전송
        socket.send(JSON.stringify({ type: "kill", voter: nickname, target }));
        input.value = ''; // 입력 필드 초기화
    }
}

// 타이머 UI를 업데이트
function updateTimer(timeLeft) {
    const timerElement = document.getElementById('timer');
    const timerDisplay = document.getElementById('timerDisplay');

    timerDisplay.innerText = `${timeLeft}s`; // 남은 시간을 표시

    // 타이머 UI가 숨겨져 있으면 표시
    if (timerElement.classList.contains('hidden')) {
        timerElement.classList.remove('hidden');
    }
}
