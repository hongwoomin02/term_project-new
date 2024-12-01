// 필요한 모듈 로드
const WebSocket = require('ws'); // WebSocket 통신을 위한 모듈
const express = require('express'); // 웹 서버 기능 제공
const path = require('path'); // 파일 및 디렉터리 경로 제어
const http = require('http'); // HTTP 서버 생성

// Express 앱 생성
const app = express();

// 정적 파일 제공 설정
// 'public' 디렉터리에 있는 파일을 정적 파일로 제공
app.use(express.static(path.join(__dirname, 'public')));

// 기본 라우트 설정
// 사용자가 '/'로 접속하면 'public/index.html'을 응답으로 전송
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// HTTP 서버 생성 및 WebSocket 서버 결합
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 서버 상태 변수 초기화
let players = []; // 현재 접속한 플레이어 목록
let maxPlayers = 5; // 최대 플레이어 수
let votes = {}; // 투표 결과 저장
let voters = []; // 투표한 플레이어 추적
let gamePhase = "아침"; // 현재 게임 단계 (아침/밤)
let rolesAssigned = false; // 역할 배정 여부
let timer = null; // 단계 타이머

//역할을 플레이어들에게 무작위로 할당
function assignRoles() {
    const shuffledPlayers = [...players]; // 플레이어 목록 복사
    shuffledPlayers.sort(() => 0.5 - Math.random()); // 무작위 정렬

    // 첫 번째 플레이어는 마피아, 나머지는 시민
    shuffledPlayers[0].role = "mafia";
    shuffledPlayers.slice(1).forEach(player => player.role = "citizen");

    rolesAssigned = true; // 역할 배정 완료
    broadcast({ type: "system", message: "게임이 시작되었습니다!" });

    let rolesAssignedCount = 0;

    // 각 플레이어에게 역할 정보 전송
    players.forEach(player => {
        player.ws.send(JSON.stringify({ 
            type: "role", 
            role: player.role, 
            message: `당신은 ${player.role}입니다` 
        }), () => {
            rolesAssignedCount++;
            if (rolesAssignedCount === players.length) {
                startTimer(); // 역할 전달 완료 후 타이머 시작
            }
        });
    });
}
//게임 단계를 전환 (아침,밤)
function switchPhase() {
    if (checkGameEnd()) {
        return; // 게임 종료 시 단계 전환 방지
    }
    // 현재 단계에 따라 다음 단계로 전환
    gamePhase = gamePhase === "아침" ? "밤" : "아침";
    voters = []; // 투표자 목록 초기화

    broadcast({ type: "status", message: `지금은 ${gamePhase}입니다.` });
    startTimer(); // 타이머 시작
}

//타이머 설정
function startTimer() {
    if (checkGameEnd()) {
        return; // 게임 종료 시 타이머 방지
    }
    if (timer) clearInterval(timer); // 기존 타이머 초기화

    let timeLeft = 30; // 각 단계의 제한 시간 30초
    broadcast({ type: "timer", timeLeft });

    timer = setInterval(() => {
        timeLeft--;
        broadcast({ type: "timer", timeLeft });

        if (timeLeft <= 0) {
            clearInterval(timer);
            timer = null;

            // 단계에 따라 다른 동작 수행
            if (gamePhase === "아침") {
                handleDayVote(); // 낮 투표 처리
            } else if (gamePhase === "밤") {
                handleNightAction(); // 밤 행동 처리
            }
            switchPhase(); // 다음 단계로 전환
        }
    }, 1000); // 1초 간격으로 타이머 감소
}

//낮 투표결과 처리
function handleDayVote() {
    // 현재 살아있는 플레이어 목록 필터링
    const alivePlayers = players.filter(player => player.alive);
    const voteCounts = {};

    // 투표 결과 집계
    Object.values(votes).forEach(vote => {
        voteCounts[vote] = (voteCounts[vote] || 0) + 1;
    });

    const sortedVotes = Object.entries(voteCounts).sort((a, b) => b[1] - a[1]);

    // 아무도 투표하지 않은 경우
    if (sortedVotes.length === 0) {
        broadcast({ type: "system", message: "아무도 투표를 하지않았습니다. 밤이됩니다.." });
        votes = {};
        return;
    }
    //투표가 동률이면 
    else if (sortedVotes.length > 1 && sortedVotes[0][1] === sortedVotes[1][1]) {
        broadcast({ type: "system", message: "투표가 동률입니다. 밤이됩니다.." });
        return;
    } 
    // 투표 결과로 사망할 플레이어 결정
    else {
        const eliminated = sortedVotes[0][0];
        const player = alivePlayers.find(p => p.playerId === eliminated);

        if (player) {
            player.alive = false; // 플레이어를 사망 상태로 변경
            player.ws.send(JSON.stringify({ type: "alert", message: "당신은 투표로 사망했습니다. 연결을 끊습니다..." }));
            player.ws.close(); // 플레이어 연결 종료
            broadcast({ type:"system", message: `${player.playerId}님 투표에의해 사망했습니다.` });
        }
    }
    votes = {}; // 투표 초기화
    checkGameEnd(); // 게임 종료 여부 확인
}

// 마피아의 밤 행동처리
function handleNightAction() {
    if (gamePhase === "밤") {
        // 살아있는 마피아 플레이어를 찾음
        const mafia = players.find(player => player.role === "mafia" && player.alive);
        if (!mafia) return; // 마피아가 없으면 아무 일도 하지 않음
        
        // 마피아 행동 처리를 위한 타이머 설정 (30초 후 실행)
        const nightTimer = setTimeout(() => {
             // 마피아가 유효한 타겟에게 투표했는지 확인
            if (Object.keys(votes).length > 0) {
                const targetId = Object.values(votes)[0];
                const target = players.find(p => p.playerId === targetId);
                // 타겟이 유효하지 않거나 이미 사망한 경우
                if (!target || !target.alive) {
                    mafia.ws.send(JSON.stringify({ type: "system", message: "유효하지않는 타겟입니다." }));
                } else { // 유효한 타겟이면 해당 플레이어를 사망 처리
                    target.alive = false; // 타겟의 생존 상태를 false로 설정
                    target.ws.send(JSON.stringify({ type: "alert", message: "당신은 마피아에의해 사망했습니다. 연결을 끊습니다..." }));
                    target.ws.close();  // 타겟과의 연결 종료
                    broadcast({ type: "system", message: `${target.playerId}는 마피아에의해 사망했습니다.` });
                }
            } else {  // 마피아가 타겟을 선택하지 않은 경우
                broadcast({ type: "system", message: "밤동안 아무일도 없었습니다." });
            }
            votes = {}; // 투표 초기화
            switchPhase();
        }, 30000); // 30초 타이머
    }
}

//게임 종료여부 확인
function checkGameEnd() {
    // 생존 상태 확인
    const aliveMafia = players.filter(player => player.role === "mafia" && player.alive).length;
    const aliveCitizens = players.filter(player => player.role === "citizen" && player.alive).length;

   // 시민 승리 조건: 모든 마피아가 제거됨
   if (aliveMafia === 0) {
        endGame("Citizens");
        return true; 
    }

    // 마피아 승리 조건: 마피아 수가 시민 수 이상
    if (aliveMafia >= aliveCitizens) {
        endGame("Mafia");
        return true; 
    }
 
    return false; //게임 계속 진행
}

//게임 종료후 처리
function endGame(winner) {
    broadcast({ type: "alert", message: `Game Over! ${winner}팀 승리!` });
      // 일정 시간 후 초기화 (예: 5초)
    setTimeout(() => {
        // 게임 상태 초기화
        players.forEach(player => {
            player.alive = true; // 모든 플레이어 초기화
            player.role = null; // 역할 초기화
        });
        votes = {};
        voters = [];
        rolesAssigned = false;
        gamePhase = "아침";
        if (timer) clearInterval(timer);
        timer = null;
    }, 5000); // 5초 대기 후 초기화
}

// 클라이언트들에게 데이터를 전송
function broadcast(data) {
    players.forEach(player => {
        if (player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(JSON.stringify(data));
        }
    });
}

// 현재 게임중인 플레이어 리스트를 처리하는 함수
function broadcastPlayerList() {
    // 살아있는 플레이어 목록을 가져오고 이를 문자열로 변환
    const playerList = players.filter(p => p.alive).map(player => player.playerId);
    // 클라이언트로 플레이어 목록 전송
    broadcast({ type: "playerList", players: playerList });
}

// WebSocket 서버의 클라이언트 연결 처리
wss.on('connection', (ws) => {
    console.log("New client connected.");

     // 게임이 이미 진행 중이면 새 클라이언트 거부
    if (rolesAssigned) {
        ws.send(JSON.stringify({ type: "alert", message: "게임이 이미 진행중입니다.." }));
        ws.send(JSON.stringify({ type: "status", message: "연결을 끊습니다.." }));
        ws.close();
        return;
    }
    // 클라이언트에서 메시지를 받았을 때 처리
    ws.on('message', (message) => {
        const data = JSON.parse(message);  // 받은 메시지를 JSON 객체로 파싱

        // 닉네임 설정 처리
        if (data.type === "setNickname") {
            const playerId = data.nickname;

            // 닉네임 중복 확인
            if (players.some(p => p.playerId === playerId)) {
                ws.send(JSON.stringify({ type: "error", message: "이미 등록된 닉네임입니다." }));
                return;
            }
            // 닉네임이 유효하다면 새로운 플레이어 추가
            players.push({ ws, playerId, role: null, alive: true });
            broadcastPlayerList();  // 모든 클라이언트에게 현재 플레이어 목록 전송

            // 플레이어가 5명 도달하면 게임 시작
            if (players.length === maxPlayers && !rolesAssigned) {
                assignRoles();
                startTimer();
            }
        }
         // 낮 동안의 투표 처리
        if (data.type === "vote") {
            if (!rolesAssigned) {
                ws.send(JSON.stringify({ type: "system", message: "게임이 아직 시작되지 않았습니다." }));
                return; // 게임 시작 전에는 투표 불가능
            }
            if (gamePhase === "밤") {
                ws.send(JSON.stringify({ type: "system", message: "아침에만 투표할 수 있습니다." }));
                return; // 밤에는 투표 동작 중지
            }
            // 투표를 이미 했는지 확인
            if (voters.includes(data.voter)) {
                ws.send(JSON.stringify({ type: "system", message: "당신은 이미 투표를 했습니다." }));
            } // 유효한 타겟인지 확인 (타겟이 살아있는 플레이어여야 함)
            else if (!players.some(p => p.playerId === data.target && p.alive)) {
                ws.send(JSON.stringify({ type: "system", message: "유효하지 않은 사람입니다." }));
            } else { // 유효한 투표일 경우
                voters.push(data.voter);
                votes[data.voter] = data.target;
                broadcast({ type: "system", message: `${data.voter}님이 투표했습니다.` });
                // 모든 생존 플레이어가 투표를 완료했는지 확인
                if (Object.keys(votes).length === players.filter(p => p.alive).length) {
                    handleDayVote(); // 낮 투표 결과 처리
                    checkGameEnd(); // 게임 종료 여부 확인
                    switchPhase(); // 다음 단계로 전환
                }
            }
        }
        
        // 마피아의 살해 행동 처리
        if (data.type === "kill") {
            if (gamePhase === "아침") {
                ws.send(JSON.stringify({ type: "system", message: "밤에만 살해할 수 있습니다." }));
                return; // 낮에는 살해 동작 불가
            }
            // 마피아 플레이어를 찾음
            const mafia = players.find(p => p.ws === ws);
            if (mafia && mafia.role === "mafia") {
                const target = players.find(p => p.playerId === data.target && p.alive);
        
                // 타겟 유효성 검사
                if (!target) {
                    mafia.ws.send(JSON.stringify({ type: "system", message: `유효하지 않은 타겟입니다.` }));
                    return; // 잘못된 타겟이므로 에러메시지 전송
                }
        
                // 유효한 타겟일 경우 처리
                votes[mafia.playerId] = data.target;
                target.alive = false;  // 타겟 사망 처리
                target.ws.send(JSON.stringify({ type: "alert", message: "당신은 마피아에 의해 사망했습니다. 연결을 끊습니다.." }));
                target.ws.close(); // 타겟과의 연결 종료
        
                broadcast({ type: "system", message: `${target.playerId}님은 마피아에 의해 사망했습니다.` });
        
                votes = {}; // 투표 데이터 초기화
                checkGameEnd(); // 게임 종료 여부 확인
                switchPhase(); // 다음 단계로 전환
            }
        }
         // 채팅 처리
        if (data.type === "chat") {
            if (gamePhase === "밤") {
                ws.send(JSON.stringify({ type: "system", message: "아침에만 채팅할 수 있습니다." }));
                return; // 밤에는 채팅 동작 중지
            }
            // 모든 클라이언트에게 채팅 메시지 브로드캐스트
            broadcast({ type: "chat", nickname: data.nickname, message: data.message });
        }
    });
    // 클라이언트가 연결을 끊었을 때 처리
    ws.on('close', () => {
        players = players.filter(player => player.ws !== ws); // 연결이 끊긴 클라이언트를 플레이어 목록에서 제거
        broadcastPlayerList();
    });
});

// HTTP 서버 실행
server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});