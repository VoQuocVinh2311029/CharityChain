/// RPC rieng doc lich su Monad Testnet
const HISTORY_RPC_URL = "https://testnet-rpc.monad.xyz";

const HISTORY_PROVIDER = new ethers.JsonRpcProvider(
    HISTORY_RPC_URL
);
// Cau hinh doc lich su Blockchain
const HISTORY_START_BLOCK = 75533915;

// Moi lan truy van 100 block
const HISTORY_CHUNK_SIZE = 100;

// Neu gap loi thi chia nho den 10 block
const HISTORY_MIN_CHUNK_SIZE = 10;

const MONAD_TESTNET_CHAIN_ID = 10143n;

const MONADVISION_TX_URL =
    "https://testnet.monadvision.com/tx/";
// CHARITYCHAIN - UNG DUNG QUYEN GOP TU THIEN
// HTML + CSS + JavaScript + Solidity + MetaMask
// Ethers.js v6
// ======================================================

const CONTRACT_ADDRESS = "0x245b86496511F7c20c669546De83983c351B60B0";

const ABI = [
    "function owner() view returns (address)",
    "function campaignCount() view returns (uint256)",
    "function createCampaign(string _title, string _description, string _imageUrl, uint256 _goal)",
    "function donate(uint256 _campaignId) payable",
    "function withdrawFunds(uint256 _campaignId)",
    "function getCampaign(uint256 _campaignId) view returns (uint256 id, string title, string description, string imageUrl, address creator, uint256 goal, uint256 totalRaised, bool withdrawn)",
    "function getContractBalance() view returns (uint256)",
    "event CampaignCreated(uint256 indexed id, string title, address indexed creator, uint256 goal)",
    "event DonationReceived(uint256 indexed campaignId, address indexed donor, uint256 amount)",
    "event FundsWithdrawn(uint256 indexed campaignId, address indexed creator, uint256 amount)"
];

// ======================================================
// BIEN TOAN CUC
// ======================================================

let provider = null;
let signer = null;
let contract = null;
let currentAccount = null;
let toastTimer = null;
let isConnecting = false;

// ======================================================
// CAU HINH LICH SU QUYEN GOP
// ======================================================

// const HISTORY_START_BLOCK = 75539915;
// const HISTORY_CHUNK_SIZE = 10000;
// const HISTORY_MIN_CHUNK_SIZE = 1000;
// const MONAD_TESTNET_CHAIN_ID = 10143n;
// const MONADVISION_TX_URL = "https://testnet.monadvision.com/tx/";

let donationHistoryLogs = [];
let donationHistoryVisible = 50;
let donationHistoryLoading = false;
let donationHistoryBlockCache = new Map();
let donationHistoryCampaignCache = new Map();

const $ = (id) => document.getElementById(id);
const grid = $("campaignGrid");
const notice = $("notice");

// ======================================================
// KIEM TRA THU VIEN
// ======================================================

function checkEthers() {
    if (typeof window.ethers === "undefined") {
        console.error("Khong tim thay ethers.js.");
        showToast("Không tải được ethers.js. Hãy kiểm tra Internet và tải lại trang.", "error");
        return false;
    }
    return true;
}

// ======================================================
// CAC HAM TIEN ICH
// ======================================================

function shortAddress(address) {
    if (!address) return "Chưa kết nối";
    return address.slice(0, 6) + "..." + address.slice(-4);
}

function formatEth(wei, decimals = 4) {
    if (wei === undefined || wei === null) return "0 MON";

    return Number(window.ethers.formatEther(wei))
        .toLocaleString("vi-VN", {
            maximumFractionDigits: decimals
        }) + " MON";
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (ch) {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        };
        return entities[ch];
    });
}

function showToast(message, type = "success") {
    const toast = $("toast");

    if (!toast) {
        console.log(message);
        return;
    }

    toast.textContent = message;
    toast.className = "toast show";

    if (type === "error") {
        toast.classList.add("error");
    }

    clearTimeout(toastTimer);

    toastTimer = setTimeout(function () {
        toast.className = "toast";
    }, 5000);
}

function setNotice(message, show = true) {
    const noticeElement = $("notice");

    if (!noticeElement) {
        console.log(message);
        return;
    }

    noticeElement.textContent = message;
    noticeElement.classList.toggle("show", show);
}

function setBusy(button, busy, text = "Đang xử lý...") {
    if (!button) return;

    if (busy) {
        if (!button.dataset.oldText) {
            button.dataset.oldText = button.textContent;
        }
        button.disabled = true;
        button.textContent = text;
    } else {
        button.disabled = false;

        if (button.dataset.oldText) {
            button.textContent = button.dataset.oldText;
            delete button.dataset.oldText;
        }
    }
}

function friendlyError(error) {
    const message = String(
        error?.shortMessage ||
        error?.reason ||
        error?.info?.error?.message ||
        error?.message ||
        "Đã xảy ra lỗi."
    );

    const lowerMessage = message.toLowerCase();

    if (
        lowerMessage.includes("user rejected") ||
        lowerMessage.includes("user denied") ||
        lowerMessage.includes("rejected the request")
    ) {
        return "Bạn đã từ chối yêu cầu trên MetaMask.";
    }

    if (lowerMessage.includes("insufficient funds")) {
        return "Ví không đủ tiền để thực hiện giao dịch và trả phí gas.";
    }

    if (message.includes("Title required")) {
        return "Vui lòng nhập tên chiến dịch.";
    }

    if (message.includes("Goal must be positive")) {
        return "Mục tiêu quyên góp phải lớn hơn 0.";
    }

    if (message.includes("Campaign not found")) {
        return "Không tìm thấy chiến dịch.";
    }

    if (message.includes("Campaign closed")) {
        return "Chiến dịch đã đóng.";
    }

    if (message.includes("Donation must be positive")) {
        return "Số tiền quyên góp phải lớn hơn 0.";
    }

    if (message.includes("Not campaign creator")) {
        return "Chỉ người tạo chiến dịch mới được rút tiền.";
    }

    if (message.includes("Already withdrawn")) {
        return "Chiến dịch đã được rút tiền.";
    }

    if (
        lowerMessage.includes("could not decode result data") ||
        lowerMessage.includes("bad data")
    ) {
        return "Không đọc được dữ liệu hợp đồng. Hãy kiểm tra địa chỉ hợp đồng và mạng MetaMask.";
    }

    if (
        lowerMessage.includes("network changed") ||
        lowerMessage.includes("chain changed")
    ) {
        return "Mạng Blockchain vừa thay đổi. Hãy tải lại trang.";
    }

    return message.length > 220
        ? message.slice(0, 220) + "..."
        : message;
}

// ======================================================
// CAP NHAT GIAO DIEN VI
// ======================================================

function updateWalletUI(address, networkName) {
    const connectBtn = $("connectBtn");

    if (connectBtn) {
        connectBtn.textContent = address
            ? shortAddress(address)
            : "Kết nối ví";

        connectBtn.title = address || "Kết nối MetaMask";
    }

    const networkElement = $("networkName");

    if (networkElement) {
        networkElement.textContent = networkName || "Chưa kết nối";
    }
}

// ======================================================
// KHOI TAO CONTRACT
// ======================================================

function isContractAddressConfigured() {
    return (
        typeof CONTRACT_ADDRESS === "string" &&
        CONTRACT_ADDRESS !== "PASTE_CONTRACT_ADDRESS_HERE" &&
        window.ethers.isAddress(CONTRACT_ADDRESS)
    );
}

function initializeContract() {
    if (!signer) {
        contract = null;
        return false;
    }

    if (!isContractAddressConfigured()) {
        contract = null;

        setNotice(
            "Ví đã kết nối. Hãy triển khai CharityDonation.sol và nhập địa chỉ hợp đồng vào app.js.",
            true
        );

        return false;
    }

    contract = new window.ethers.Contract(
        CONTRACT_ADDRESS,
        ABI,
        signer
    );

    return true;
}

// ======================================================
// KET NOI METAMASK
// ======================================================

async function connectWallet() {
    if (isConnecting) return;
    if (!checkEthers()) return;

    if (!window.ethereum) {
        showToast(
            "Không tìm thấy MetaMask. Hãy cài MetaMask trên trình duyệt rồi tải lại trang.",
            "error"
        );
        return;
    }

    isConnecting = true;

    const connectBtn = $("connectBtn");
    setBusy(connectBtn, true, "Đang kết nối...");

    try {
        const accounts = await window.ethereum.request({
            method: "eth_requestAccounts"
        });

        if (!accounts || accounts.length === 0) {
            throw new Error("Bạn chưa chọn tài khoản MetaMask.");
        }

        provider = new window.ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
        currentAccount = await signer.getAddress();

        const network = await provider.getNetwork();

        const networkName =
            network.name && network.name !== "unknown"
                ? network.name
                : "Chain ID " + network.chainId.toString();

        updateWalletUI(currentAccount, networkName);

        showToast(
            "Kết nối MetaMask thành công: " + shortAddress(currentAccount)
        );

        const ready = initializeContract();
        if (!ready) return;

        setNotice("Đã kết nối ví. Đang kiểm tra Smart Contract...", true);

        const count = await contract.campaignCount();

        console.log("Dia chi vi:", currentAccount);
        console.log("Chain ID:", network.chainId.toString());
        console.log("Dia chi contract:", CONTRACT_ADDRESS);
        console.log("So chien dich:", count.toString());

        await loadCampaigns();

        showToast("Đã kết nối ví và Smart Contract thành công.");

    } catch (error) {
        console.error("Loi ket noi MetaMask:", error);
        showToast(friendlyError(error), "error");

    } finally {
        isConnecting = false;

        if (connectBtn) {
            connectBtn.disabled = false;
            connectBtn.textContent = currentAccount
                ? shortAddress(currentAccount)
                : "Kết nối ví";
        }
    }
}

// ======================================================
// TAI DANH SACH CHIEN DICH
// ======================================================


async function loadCampaigns() {
    if (!checkEthers()) return;

    if (!contract) {
        setNotice(
            "Hãy kết nối MetaMask và cấu hình địa chỉ Smart Contract.",
            true
        );
        return;
    }

    try {
        setNotice("Đang tải dữ liệu từ Blockchain...", true);

        if (grid) {
            grid.innerHTML = `
                <div class="empty-state">
                    <p>Đang tải dữ liệu...</p>
                </div>
            `;
        }

        const countBigInt = await contract.campaignCount();
        const count = Number(countBigInt);

        // Danh sach tat ca chien dich
        const allCampaigns = [];

        // Danh sach chien dich chua rut tien
        const activeCampaigns = [];

        let totalRaised = 0n;

        // Doc du lieu tu Smart Contract
        for (let id = 1; id <= count; id++) {
            const c = await contract.getCampaign(id);

            const campaign = {
                id: Number(c.id),
                title: c.title,
                description: c.description,
                imageUrl: c.imageUrl,
                creator: c.creator,
                goal: c.goal,
                totalRaised: c.totalRaised,
                withdrawn: c.withdrawn
            };

            allCampaigns.push(campaign);

            // Chi hien thi chien dich chua rut tien
            if (!campaign.withdrawn) {
                activeCampaigns.push(campaign);

                totalRaised += campaign.totalRaised;
            }
        }

        // Cap nhat tong so chien dich dang hien thi
        if ($("campaignCount")) {
            $("campaignCount").textContent =
                activeCampaigns.length.toLocaleString("vi-VN");
        }

        // Cap nhat tong tien dang con trong cac chien dich
        if ($("totalRaised")) {
            $("totalRaised").textContent =
                formatEth(totalRaised);
        }

        if (!grid) {
            setNotice(
                "Đã đọc " + count +
                " chiến dịch, còn " +
                activeCampaigns.length +
                " chiến dịch chưa rút tiền.",
                true
            );

            return;
        }

        // Chua tung co chien dich nao
        if (count === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">♡</div>
                    <h3>Chưa có chiến dịch nào</h3>
                    <p>Hãy tạo chiến dịch quyên góp đầu tiên.</p>
                </div>
            `;

            setNotice(
                "Smart Contract chưa có chiến dịch. Bạn có thể tạo chiến dịch mới.",
                true
            );

            await loadDonationHistory();
            return;
        }

        // Tat ca chien dich da rut tien
        if (activeCampaigns.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">✓</div>
                    <h3>Không còn chiến dịch đang hoạt động</h3>
                    <p>
                        Tất cả chiến dịch đã rút tiền thành công.
                        Bạn có thể tạo chiến dịch quyên góp mới.
                    </p>
                </div>
            `;

            setNotice(
                "Đã ẩn " + count +
                " chiến dịch đã rút tiền. Không còn chiến dịch đang hoạt động.",
                true
            );

            await loadDonationHistory();
            return;
        }

        // Hien thi cac chien dich chua rut tien
        grid.innerHTML = activeCampaigns
            .map(function (campaign) {
                return renderCampaign(campaign);
            })
            .join("");

        // Gan su kien cho cac nut
        bindCampaignButtons();

        setNotice(
            "Đã tải " +
            activeCampaigns.length +
            " chiến dịch đang hoạt động. Đã ẩn " +
            (count - activeCampaigns.length) +
            " chiến dịch đã rút tiền.",
            true
        );

        // Cap nhat lich su quyên gop
        await loadDonationHistory();

    } catch (error) {
        console.error("Loi tai chien dich:", error);

        setNotice(
            "Không thể đọc dữ liệu. Hãy kiểm tra địa chỉ hợp đồng và mạng MetaMask.",
            true
        );

        if (grid) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">!</div>
                    <h3>Không tải được chiến dịch</h3>
                    <p>
                        Kiểm tra địa chỉ Smart Contract
                        và mạng Blockchain.
                    </p>
                </div>
            `;
        }

        showToast(
            "Không thể tải chiến dịch. Mở Console để xem lỗi chi tiết.",
            "error"
        );
    }
}


// ======================================================
// HIEN THI MOT CHIEN DICH
// ======================================================

function renderCampaign(c) {
    const reached = c.totalRaised >= c.goal;

    const percent = c.goal === 0n
        ? 0
        : Math.min(
            100,
            Number((c.totalRaised * 10000n) / c.goal) / 100
        );

    const isCreator =
        currentAccount &&
        c.creator.toLowerCase() === currentAccount.toLowerCase();

    let status = "Đang nhận quyên góp";

    if (c.withdrawn) {
        status = "Đã rút tiền";
    } else if (reached) {
        status = "Đạt mục tiêu";
    }

    let actions = "";

    if (!c.withdrawn) {
        actions += `
            <div class="donate-row">
                <input
                    class="donate-input"
                    id="donate-${c.id}"
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    placeholder="Số MON muốn gửi"
                >

                <button
                    class="btn btn-primary donate-btn"
                    data-id="${c.id}"
                    type="button"
                >
                    Quyên góp ↗
                </button>
            </div>
        `;
    }

    if (!c.withdrawn && isCreator && c.totalRaised > 0n) {
        actions += `
            <div class="card-actions">
                <button
                    class="btn btn-small-outline withdraw-btn"
                    data-id="${c.id}"
                    type="button"
                >
                    Rút tiền về ví tạo chiến dịch
                </button>
            </div>
        `;
    }

    let imageHtml = "";

    if (c.imageUrl) {
        imageHtml = `
            <img
                class="campaign-image"
                src="${escapeHtml(c.imageUrl)}"
                alt="${escapeHtml(c.title)}"
                onerror="this.style.display='none'"
            >
        `;
    }

    return `
        <article class="campaign-card">
            <div class="campaign-visual visual-${(c.id % 3) + 1}">
                ${imageHtml}
                <span class="visual-label">CHARITYCHAIN · #${c.id}</span>
                <span class="visual-symbol">♡</span>
            </div>

            <div class="campaign-body">
                <div class="campaign-meta">
                    <span>CHIẾN DỊCH #${c.id}</span>
                    <span class="status-pill">${escapeHtml(status)}</span>
                </div>

                <h3>${escapeHtml(c.title)}</h3>

                <p class="campaign-description">
                    ${escapeHtml(c.description)}
                </p>

                <div class="funding-row">
                    <div>
                        <strong>${formatEth(c.totalRaised)}</strong>
                        <small>Đã quyên góp</small>
                    </div>
                    <div class="goal-label">
                        <strong>${formatEth(c.goal)}</strong>
                        <small>Mục tiêu</small>
                    </div>
                </div>

                <div class="progress-track">
                    <div class="progress-fill" style="width:${percent}%"></div>
                </div>

                <div class="card-info">
                    <span>Tiến độ</span>
                    <span>${percent.toFixed(1)}%</span>
                </div>

                <div class="card-info">
                    <span>Người tạo</span>
                    <span title="${escapeHtml(c.creator)}">
                        ${shortAddress(c.creator)}
                    </span>
                </div>

                ${actions}
            </div>
        </article>
    `;
}

// ======================================================
// GAN SU KIEN QUYEN GOP VA RUT TIEN
// ======================================================

function bindCampaignButtons() {
    document.querySelectorAll(".donate-btn").forEach(function (button) {
        button.addEventListener("click", async function () {
            if (!contract || !signer) {
                showToast("Hãy kết nối MetaMask trước.", "error");
                return;
            }

            const id = Number(button.dataset.id);
            const input = $("donate-" + id);
            const amount = input ? input.value.trim() : "";

            if (
                !amount ||
                !Number.isFinite(Number(amount)) ||
                Number(amount) <= 0
            ) {
                showToast("Nhập số MON lớn hơn 0.", "error");
                return;
            }

            let value;

            try {
                value = window.ethers.parseEther(amount);
            } catch (error) {
                showToast("Số MON không hợp lệ.", "error");
                return;
            }

            if (value <= 0n) {
                showToast("Số tiền quyên góp phải lớn hơn 0.", "error");
                return;
            }

            try {
                setBusy(button, true, "Đang gửi...");

                const tx = await contract.donate(id, {
                    value: value
                });

                showToast("Đã gửi giao dịch. Đang chờ xác nhận...");

                await tx.wait();

                showToast("Quyên góp thành công!");

                if (input) input.value = "";

                await loadCampaigns();

            } catch (error) {
                console.error("Loi quyen gop:", error);
                showToast(friendlyError(error), "error");

            } finally {
                setBusy(button, false);
            }
        });
    });

    document.querySelectorAll(".withdraw-btn").forEach(function (button) {
        button.addEventListener("click", async function () {
            if (!contract || !signer) {
                showToast("Hãy kết nối MetaMask trước.", "error");
                return;
            }

            const id = Number(button.dataset.id);

            const confirmed = window.confirm(
                "Bạn có chắc muốn rút toàn bộ tiền của chiến dịch #" + id + "?"
            );

            if (!confirmed) return;

            try {
                setBusy(button, true, "Đang rút tiền...");

                const tx = await contract.withdrawFunds(id);

                showToast("Đang chờ xác nhận giao dịch rút tiền...");

                await tx.wait();

                showToast("Rút tiền thành công!");

                await loadCampaigns();

            } catch (error) {
                console.error("Loi rut tien:", error);
                showToast(friendlyError(error), "error");

            } finally {
                setBusy(button, false);
            }
        });
    });
}

// ======================================================
// LICH SU QUYEN GOP - DOC SU KIEN TU BLOCKCHAIN
// ======================================================

function ensureDonationHistorySection() {
    if ($("donationHistorySection")) return;

    const campaignsSection = $("campaigns");
    if (!campaignsSection) return;

    const section = document.createElement("section");
    section.id = "donationHistorySection";
    section.className = "section-wrap donation-history-section";

    section.innerHTML = `
        <div class="section-heading">
            <div>
                <div class="eyebrow">MINH BẠCH TRÊN BLOCKCHAIN</div>
                <h2>Lịch sử quyên góp</h2>
                <p>Các khoản quyên góp được đọc trực tiếp từ sự kiện DonationReceived của Smart Contract.</p>
            </div>
            <button class="btn btn-outline" id="refreshHistoryBtn" type="button">
                ↻ Làm mới lịch sử
            </button>
        </div>

        <div class="history-summary" id="historySummary">
            Kết nối MetaMask để tải lịch sử quyên góp.
        </div>

        <div class="history-filters">
            <label class="history-filter-label">
                Chiến dịch
                <select id="historyCampaignFilter">
                    <option value="all">Tất cả chiến dịch</option>
                </select>
            </label>

            <label class="history-filter-label">
                Địa chỉ ví người quyên góp
                <input
                    id="historyDonorFilter"
                    type="text"
                    placeholder="Nhập địa chỉ ví hoặc một phần địa chỉ"
                >
            </label>
        </div>

        <div class="history-table-wrap">
            <table class="history-table">
                <thead>
                    <tr>
                        <th>Chiến dịch</th>
                        <th>Người quyên góp</th>
                        <th>Số tiền</th>
                        <th>Thời gian</th>
                        <th>Giao dịch</th>
                    </tr>
                </thead>

                <tbody id="donationHistoryBody">
                    <tr>
                        <td colspan="5" class="history-empty">
                            Chưa tải dữ liệu.
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div class="history-footer">
            <span id="historyCountLabel">0 giao dịch</span>
            <button
                class="btn btn-outline"
                id="historyLoadMoreBtn"
                type="button"
                hidden
            >
                Xem thêm
            </button>
        </div>

        <p class="history-footnote">
            Nguồn dữ liệu: Monad Testnet · Contract:
            ${CONTRACT_ADDRESS} · Từ Block ${HISTORY_START_BLOCK}
        </p>
    `;

    campaignsSection.insertAdjacentElement("afterend", section);

    const style = document.createElement("style");
    style.id = "donationHistoryStyles";

    style.textContent = `
        .donation-history-section {
            padding-top: 72px;
            padding-bottom: 72px;
        }

        .history-summary {
            margin: 18px 0;
            padding: 14px 18px;
            border: 1px solid #dce8e3;
            border-radius: 12px;
            background: #f5faf7;
            color: #245b49;
            font-size: 14px;
        }

        .history-filters {
            display: grid;
            grid-template-columns: minmax(220px, 1fr) minmax(260px, 2fr);
            gap: 14px;
            margin: 18px 0;
        }

        .history-filter-label {
            display: flex;
            flex-direction: column;
            gap: 7px;
            font-size: 13px;
            font-weight: 700;
            color: #355449;
        }

        .history-filter-label input,
        .history-filter-label select {
            width: 100%;
            min-height: 44px;
            padding: 10px 12px;
            border: 1px solid #d8e2dd;
            border-radius: 9px;
            background: #fff;
            color: #243b33;
            font: inherit;
            font-weight: 400;
        }

        .history-table-wrap {
            width: 100%;
            overflow-x: auto;
            border: 1px solid #e3eae6;
            border-radius: 12px;
            background: #fff;
        }

        .history-table {
            width: 100%;
            border-collapse: collapse;
            min-width: 850px;
            font-size: 13px;
        }

        .history-table th,
        .history-table td {
            padding: 14px 13px;
            text-align: left;
            border-bottom: 1px solid #edf1ee;
            vertical-align: middle;
        }

        .history-table th {
            background: #f4f8f5;
            color: #315849;
            font-weight: 700;
            white-space: nowrap;
        }

        .history-table tr:last-child td {
            border-bottom: 0;
        }

        .history-address {
            font-family: monospace;
            color: #45645a;
            white-space: nowrap;
        }

        .history-amount {
            font-weight: 700;
            color: #087653;
            white-space: nowrap;
        }

        .history-tx-link {
            color: #087653;
            font-weight: 700;
            text-decoration: none;
            white-space: nowrap;
        }

        .history-tx-link:hover {
            text-decoration: underline;
        }

        .history-empty {
            text-align: center !important;
            color: #718078;
            padding: 28px !important;
        }

        .history-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-top: 14px;
            color: #66756d;
            font-size: 13px;
        }

        .history-footnote {
            margin-top: 14px;
            color: #7a8981;
            font-size: 11px;
            overflow-wrap: anywhere;
        }

        @media(max-width:700px) {
            .history-filters {
                grid-template-columns: 1fr;
            }

            .donation-history-section {
                padding-top: 48px;
                padding-bottom: 48px;
            }
        }
    `;

    document.head.appendChild(style);

    const campaignFilter = $("historyCampaignFilter");
    const donorFilter = $("historyDonorFilter");
    const refreshHistoryBtn = $("refreshHistoryBtn");
    const loadMoreBtn = $("historyLoadMoreBtn");

    if (campaignFilter) {
        campaignFilter.addEventListener("change", function () {
            donationHistoryVisible = 50;
            renderDonationHistory();
        });
    }

    if (donorFilter) {
        donorFilter.addEventListener("input", function () {
            donationHistoryVisible = 50;
            renderDonationHistory();
        });
    }

    if (refreshHistoryBtn) {
        refreshHistoryBtn.addEventListener("click", loadDonationHistory);
    }

    if (loadMoreBtn) {
        loadMoreBtn.addEventListener("click", function () {
            donationHistoryVisible += 50;
            renderDonationHistory();
        });
    }
}

// ======================================================
// CAP NHAT THONG BAO LICH SU
// ======================================================

function setHistoryMessage(message, isError = false) {
    const summary = $("historySummary");
    if (!summary) return;

    summary.textContent = message;
    summary.style.background = isError ? "#fff5f3" : "#f5faf7";
    summary.style.borderColor = isError ? "#f2c9c1" : "#dce8e3";
    summary.style.color = isError ? "#a33c2d" : "#245b49";
}

function getHistoryCampaignFilter() {
    return $("historyCampaignFilter")?.value || "all";
}

function getHistoryDonorFilter() {
    return ($("historyDonorFilter")?.value || "").trim().toLowerCase();
}

// ======================================================
// TRUY VAN SU KIEN DONATIONRECEIVED
// ======================================================

// RPC co the gioi han so block moi lan truy van.
// Neu gap loi, tu dong chia nho khoang block.

async function getDonationLogsInRange(
    fromBlock,
    toBlock,
    topicHash
) {
    try {
        return await HISTORY_PROVIDER.getLogs({
            address: CONTRACT_ADDRESS,
            fromBlock: fromBlock,
            toBlock: toBlock,
            topics: [topicHash]
        });

    } catch (error) {
        const span = toBlock - fromBlock + 1;

        console.warn(
            `RPC lỗi, đang chia nhỏ: ${fromBlock} - ${toBlock}`,
            error.shortMessage || error.message
        );

        if (span <= HISTORY_MIN_CHUNK_SIZE) {
            throw error;
        }

        const middle = Math.floor(
            (fromBlock + toBlock) / 2
        );

        const first = await getDonationLogsInRange(
            fromBlock,
            middle,
            topicHash
        );

        const second = await getDonationLogsInRange(
            middle + 1,
            toBlock,
            topicHash
        );

        return [...first, ...second];
    }
}


// ======================================================
// LAY THOI GIAN BLOCK
// ======================================================

async function getDonationBlockTime(blockNumber) {
    const key = Number(blockNumber);

    if (donationHistoryBlockCache.has(key)) {
        return donationHistoryBlockCache.get(key);
    }

    const promise = provider.getBlock(key).then(function (block) {
        return block ? Number(block.timestamp) : null;
    });

    donationHistoryBlockCache.set(key, promise);

    return promise;
}

// ======================================================
// LAY TEN CHIEN DICH
// ======================================================

async function getDonationCampaignTitle(campaignId) {
    const key = String(campaignId);

    if (donationHistoryCampaignCache.has(key)) {
        return donationHistoryCampaignCache.get(key);
    }

    const promise = contract.getCampaign(campaignId)
        .then(function (campaign) {
            return campaign.title || ("Chiến dịch #" + key);
        })
        .catch(function () {
            return "Chiến dịch #" + key;
        });

    donationHistoryCampaignCache.set(key, promise);

    return promise;
}

// ======================================================
// LOC LICH SU QUYEN GOP
// ======================================================

function filteredDonationHistory() {
    const selectedCampaign = getHistoryCampaignFilter();
    const donorSearch = getHistoryDonorFilter();

    return donationHistoryLogs.filter(function (item) {
        const campaignMatches =
            selectedCampaign === "all" ||
            String(item.campaignId) === selectedCampaign;

        const donorMatches =
            !donorSearch ||
            item.donor.toLowerCase().includes(donorSearch);

        return campaignMatches && donorMatches;
    });
}

// ======================================================
// HIEN THI LICH SU QUYEN GOP
// ======================================================

async function renderDonationHistory() {
    const body = $("donationHistoryBody");
    const countLabel = $("historyCountLabel");
    const loadMoreBtn = $("historyLoadMoreBtn");

    if (!body) return;

    const filtered = filteredDonationHistory();

    const visibleItems = filtered.slice(
        0,
        donationHistoryVisible
    );

    if (countLabel) {
        countLabel.textContent =
            filtered.length.toLocaleString("vi-VN") +
            " giao dịch";
    }

    if (loadMoreBtn) {
        loadMoreBtn.hidden =
            filtered.length <= visibleItems.length;
    }

    if (filtered.length === 0) {
        body.innerHTML = `
            <tr>
                <td colspan="5" class="history-empty">
                    Không tìm thấy giao dịch quyên góp phù hợp.
                </td>
            </tr>
        `;
        return;
    }

    body.innerHTML = `
        <tr>
            <td colspan="5" class="history-empty">
                Đang chuẩn bị ${visibleItems.length} giao dịch...
            </td>
        </tr>
    `;

    try {
        const rows = await Promise.all(
            visibleItems.map(async function (item) {

                const [timestamp, campaignTitle] =
                    await Promise.all([
                        getDonationBlockTime(item.blockNumber),
                        getDonationCampaignTitle(item.campaignId)
                    ]);

                const dateText = timestamp
                    ? new Date(timestamp * 1000).toLocaleString("vi-VN")
                    : ("Block #" + item.blockNumber);

                const txUrl =
                    MONADVISION_TX_URL + item.transactionHash;

                return `
                    <tr>
                        <td>
                            <strong>#${item.campaignId}</strong>
                            <br>
                            <span>${escapeHtml(campaignTitle)}</span>
                        </td>

                        <td
                            class="history-address"
                            title="${escapeHtml(item.donor)}"
                        >
                            ${escapeHtml(shortAddress(item.donor))}
                        </td>

                        <td class="history-amount">
                            ${formatEth(item.amount)}
                        </td>

                        <td>
                            ${escapeHtml(dateText)}
                        </td>

                        <td>
                            <a
                                class="history-tx-link"
                                href="${txUrl}"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Xem giao dịch ↗
                            </a>
                        </td>
                    </tr>
                `;
            })
        );

        body.innerHTML = rows.join("");

    } catch (error) {
        console.error(
            "Loi hien thi lich su quyên gop:",
            error
        );

        body.innerHTML = `
            <tr>
                <td colspan="5" class="history-empty">
                    Không tải được thời gian giao dịch.
                    Hãy thử làm mới lịch sử.
                </td>
            </tr>
        `;
    }
}

// ======================================================
// TAI LICH SU QUYEN GOP TU MONAD TESTNET
// ======================================================


// ==========================================
// BO NHO DEM LICH SU QUYEN GOP CHARITYCHAIN
// ==========================================

// Tao khoa rieng theo dia chi Smart Contract
function getDonationHistoryCacheKey() {
    return (
        "charitychain_history_v1_" +
        MONAD_TESTNET_CHAIN_ID.toString() +
        "_" +
        CONTRACT_ADDRESS.toLowerCase()
    );
}

// Doc bo nho dem
function loadDonationHistoryCache() {
    try {
        const key = getDonationHistoryCacheKey();
        const raw = localStorage.getItem(key);

        if (!raw) return null;

        const cache = JSON.parse(raw);

        if (
            cache.version !== 1 ||
            !Array.isArray(cache.items) ||
            !Number.isSafeInteger(cache.lastScannedBlock)
        ) {
            return null;
        }

        return cache;

    } catch (error) {
        console.warn(
            "Khong doc duoc cache lich su:",
            error
        );

        return null;
    }
}

// Luu bo nho dem
function saveDonationHistoryCache(
    items,
    lastScannedBlock
) {
    try {
        const key = getDonationHistoryCacheKey();

        const cache = {
            version: 1,
            lastScannedBlock: lastScannedBlock,
            savedAt: Date.now(),

            items: items.map(item => ({
                campaignId: item.campaignId,
                donor: item.donor,
                amount: item.amount.toString(),
                transactionHash: item.transactionHash,
                blockNumber: item.blockNumber,
                logIndex: item.logIndex
            }))
        };

        localStorage.setItem(
            key,
            JSON.stringify(cache)
        );

        return true;

    } catch (error) {
        console.warn(
            "Khong the luu cache lich su:",
            error
        );

        return false;
    }
}

// Giai ma cac su kien DonationReceived
function parseDonationHistoryLogs(logs) {
    const items = [];

    for (const log of logs) {
        try {
            const parsed =
                contract.interface.parseLog({
                    topics: log.topics,
                    data: log.data
                });

            if (
                !parsed ||
                parsed.name !== "DonationReceived"
            ) {
                continue;
            }

            items.push({
                campaignId: Number(
                    parsed.args.campaignId
                ),

                donor: parsed.args.donor,

                amount: parsed.args.amount,

                transactionHash:
                    log.transactionHash,

                blockNumber:
                    log.blockNumber,

                logIndex:
                    log.index
            });

        } catch (error) {
            console.warn(
                "Khong giai ma duoc su kien:",
                error
            );
        }
    }

    return items;
}

// Loai bo giao dich trung va sap xep
function normalizeDonationHistory(items) {
    const unique = new Map();

    for (const item of items) {
        const key =
            item.transactionHash.toLowerCase() +
            "-" +
            item.logIndex;

        unique.set(key, item);
    }

    return [...unique.values()].sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) {
            return b.blockNumber - a.blockNumber;
        }

        return b.logIndex - a.logIndex;
    });
}

// Cap nhat bo loc chien dich
function updateDonationHistoryFilter(items) {
    const campaignFilter =
        $("historyCampaignFilter");

    if (!campaignFilter) return;

    const previousValue =
        campaignFilter.value || "all";

    const ids = [
        ...new Set(
            items.map(item => item.campaignId)
        )
    ].sort((a, b) => a - b);

    campaignFilter.innerHTML =
        '<option value="all">Tất cả chiến dịch</option>' +
        ids.map(id =>
            `<option value="${id}">Chiến dịch #${id}</option>`
        ).join("");

    if (
        previousValue === "all" ||
        ids.includes(Number(previousValue))
    ) {
        campaignFilter.value = previousValue;
    }
}



async function loadDonationHistory() {
    if (donationHistoryLoading) return;
    if (!checkEthers()) return;

    ensureDonationHistorySection();

    if (!contract) {
        setHistoryMessage(
            "Hãy kết nối MetaMask trước khi tải lịch sử.",
            true
        );
        return;
    }

    if (!isContractAddressConfigured()) {
        setHistoryMessage(
            "Địa chỉ Smart Contract chưa được cấu hình.",
            true
        );
        return;
    }

    donationHistoryLoading = true;

    const refreshButton = $("refreshHistoryBtn");

    setBusy(refreshButton, true, "Đang tải...");

    try {
        // 1. Kiem tra mang MetaMask
        const network = await provider.getNetwork();

        if (network.chainId !== MONAD_TESTNET_CHAIN_ID) {
            throw new Error(
                "Vui lòng chuyển MetaMask sang Monad Testnet."
            );
        }

        // 2. Kiem tra RPC lich su
        const historyNetwork =
            await HISTORY_PROVIDER.getNetwork();

        if (
            historyNetwork.chainId !==
            MONAD_TESTNET_CHAIN_ID
        ) {
            throw new Error(
                "RPC lịch sử không kết nối đúng Monad Testnet."
            );
        }

        // 3. Lay block moi nhat
        const latestBlock =
            await HISTORY_PROVIDER.getBlockNumber();

        // 4. Doc cache
        const cache = loadDonationHistoryCache();

        let cachedItems = [];
        let lastScannedBlock = HISTORY_START_BLOCK - 1;

        if (cache) {
            const validCache =
                cache.lastScannedBlock >=
                    HISTORY_START_BLOCK - 1 &&
                cache.lastScannedBlock <= latestBlock;

            if (validCache) {
                cachedItems = cache.items.map(item => ({
                    campaignId: Number(item.campaignId),
                    donor: item.donor,
                    amount: BigInt(item.amount),
                    transactionHash: item.transactionHash,
                    blockNumber: Number(item.blockNumber),
                    logIndex: Number(item.logIndex)
                }));

                lastScannedBlock =
                    cache.lastScannedBlock;
            }
        }

        // Hien thi lich su cu ngay lap tuc
        donationHistoryLogs =
            normalizeDonationHistory(cachedItems);

        donationHistoryVisible = 50;

        updateDonationHistoryFilter(
            donationHistoryLogs
        );

        await renderDonationHistory();

        // 5. Kiem tra co block moi khong
        if (latestBlock <= lastScannedBlock) {
            setHistoryMessage(
                "Lịch sử đã được cập nhật. Không có giao dịch mới. Tổng cộng: " +
                donationHistoryLogs.length +
                " giao dịch."
            );

            return;
        }

        // 6. Xac dinh khoang block can quet
        const startBlock =
            lastScannedBlock + 1;

        const eventFragment =
            contract.interface.getEvent(
                "DonationReceived"
            );

        const topicHash =
            eventFragment.topicHash;

        const chunks = [];

        for (
            let fromBlock = startBlock;
            fromBlock <= latestBlock;
            fromBlock += HISTORY_CHUNK_SIZE
        ) {
            const toBlock = Math.min(
                fromBlock + HISTORY_CHUNK_SIZE - 1,
                latestBlock
            );

            chunks.push({
                fromBlock,
                toBlock
            });
        }

        const totalChunks = chunks.length;

        let completedChunks = 0;
        let newItems = [];

        const CONCURRENT_REQUESTS = 4;

        // Luu tien do moi 20 dot
        const SAVE_EVERY_BATCHES = 20;

        // 7. Chay truy van theo tung dot
        for (
            let i = 0;
            i < totalChunks;
            i += CONCURRENT_REQUESTS
        ) {
            const batch = chunks.slice(
                i,
                i + CONCURRENT_REQUESTS
            );

            // Cac nhom trong cung mot dot chay dong thoi
            const results = await Promise.all(
                batch.map(async chunk => {
                    const logs =
                        await getDonationLogsInRange(
                            chunk.fromBlock,
                            chunk.toBlock,
                            topicHash
                        );

                    return {
                        toBlock: chunk.toBlock,
                        items:
                            parseDonationHistoryLogs(logs)
                    };
                })
            );

            // Chi them du lieu sau khi ca dot thanh cong
            for (const result of results) {
                newItems.push(...result.items);
            }

            completedChunks += batch.length;

            const currentBlock =
                batch[batch.length - 1].toBlock;

            setHistoryMessage(
                "Đang cập nhật lịch sử: " +
                completedChunks +
                "/" +
                totalChunks +
                " nhóm block..."
            );

            // Cap nhat du lieu tren giao dien
            donationHistoryLogs =
                normalizeDonationHistory([
                    ...cachedItems,
                    ...newItems
                ]);

            await renderDonationHistory();

            // Luu cache dinh ky
            const batchesCompleted =
                Math.ceil(
                    completedChunks /
                    CONCURRENT_REQUESTS
                );

            if (
                batchesCompleted %
                    SAVE_EVERY_BATCHES === 0 ||
                completedChunks === totalChunks
            ) {
                const allItems =
                    normalizeDonationHistory([
                        ...cachedItems,
                        ...newItems
                    ]);

                const saved =
                    saveDonationHistoryCache(
                        allItems,
                        currentBlock
                    );

                if (saved) {
                    // Danh dau du lieu da duoc luu
                    cachedItems = allItems;
                    lastScannedBlock = currentBlock;

                    newItems = [];
                }
            }
        }

        // 8. Luu cache lan cuoi
        if (lastScannedBlock < latestBlock) {
            const allItems =
                normalizeDonationHistory([
                    ...cachedItems,
                    ...newItems
                ]);

            saveDonationHistoryCache(
                allItems,
                latestBlock
            );

            donationHistoryLogs = allItems;
        }

        // 9. Sap xep va cap nhat giao dien
        donationHistoryLogs =
            normalizeDonationHistory(
                donationHistoryLogs
            );

        donationHistoryVisible = 50;

        updateDonationHistoryFilter(
            donationHistoryLogs
        );

        await renderDonationHistory();

        // 10. Tinh tong tien
        const totalAmount =
            donationHistoryLogs.reduce(
                (sum, item) => sum + item.amount,
                0n
            );

        setHistoryMessage(
            "Cập nhật thành công " +
            donationHistoryLogs.length +
            " giao dịch. Tổng quyên góp: " +
            formatEth(totalAmount) +
            " MON."
        );

        console.log(
            "Donation history:",
            donationHistoryLogs
        );

        console.log(
            "Last scanned block:",
            lastScannedBlock
        );

    } catch (error) {
        console.error(
            "Donation history error:",
            error
        );

        setHistoryMessage(
            "Không thể tải lịch sử: " +
            friendlyError(error),
            true
        );

    } finally {
        donationHistoryLoading = false;

        setBusy(refreshButton, false);
    }
}



// ======================================================
// CAP NHAT NHAN DON VI MON TREN GIAO DIEN
// ======================================================

function updateMonadCurrencyLabels() {
    const totalRaisedElement = $("totalRaised");

    if (totalRaisedElement?.previousElementSibling) {
        totalRaisedElement.previousElementSibling.textContent =
            "Tổng MON đã quyên góp";
    }

    const goalLabel =
        document.querySelector('label[for="campaignGoal"]');

    if (goalLabel) {
        goalLabel.innerHTML =
            'Mục tiêu (MON) <span>*</span>';
    }

    const donationStep =
        document.querySelector(
            "#how-it-works .step-card:nth-child(2) p"
        );

    if (donationStep) {
        donationStep.textContent =
            "Nhập số MON muốn đóng góp và xác nhận giao dịch trên ví.";
    }

    const footnote =
        document.querySelector("#createForm .form-footnote");

    if (footnote) {
        footnote.textContent =
            "Ví của bạn cần có MON thử nghiệm để trả phí gas.";
    }
}

// ======================================================
// TAO CHIEN DICH
// ======================================================

const createForm = $("createForm");

if (createForm) {
    createForm.addEventListener(
        "submit",
        async function (event) {
            event.preventDefault();

            if (!contract || !signer) {
                showToast(
                    "Hãy kết nối MetaMask và cấu hình Smart Contract trước.",
                    "error"
                );
                return;
            }

            const title =
                $("campaignTitle")?.value.trim() || "";

            const description =
                $("campaignDescription")?.value.trim() || "";

            const goal =
                $("campaignGoal")?.value.trim() || "";

            if (!title || !description) {
                showToast(
                    "Vui lòng nhập tên và mô tả chiến dịch.",
                    "error"
                );
                return;
            }

            if (
                !goal ||
                !Number.isFinite(Number(goal)) ||
                Number(goal) <= 0
            ) {
                showToast(
                    "Mục tiêu quyên góp phải lớn hơn 0.",
                    "error"
                );
                return;
            }

            let goalWei;

            try {
                goalWei = window.ethers.parseEther(goal);
            } catch (error) {
                showToast(
                    "Mục tiêu MON không hợp lệ.",
                    "error"
                );
                return;
            }

            if (goalWei <= 0n) {
                showToast(
                    "Mục tiêu quyên góp phải lớn hơn 0.",
                    "error"
                );
                return;
            }

            const button =
                event.submitter ||
                createForm.querySelector(
                    'button[type="submit"]'
                );

            try {
                setBusy(
                    button,
                    true,
                    "Đang tạo chiến dịch..."
                );

                // Hop dong hien tai chua ho tro thoi han chien dich.
                // Su dung anh mau.
                const imageUrl =
                    "https://placehold.co/600x400/png";

                const tx = await contract.createCampaign(
                    title,
                    description,
                    imageUrl,
                    goalWei
                );

                showToast(
                    "Đã gửi yêu cầu tạo chiến dịch. Vui lòng xác nhận trên MetaMask."
                );

                await tx.wait();

                createForm.reset();

                showToast(
                    "Tạo chiến dịch thành công!"
                );

                await loadCampaigns();

            } catch (error) {
                console.error("Loi tao chien dich:", error);

                showToast(
                    friendlyError(error),
                    "error"
                );

            } finally {
                setBusy(button, false);
            }
        }
    );
}

// ======================================================
// NUT KET NOI VI
// ======================================================

const connectBtn = $("connectBtn");

if (connectBtn) {
    connectBtn.addEventListener(
        "click",
        connectWallet
    );
}

// ======================================================
// NUT LAM MOI DU LIEU
// ======================================================

const refreshBtn = $("refreshBtn");

if (refreshBtn) {
    refreshBtn.addEventListener(
        "click",
        async function () {
            if (!contract) {
                showToast(
                    "Hãy kết nối MetaMask trước.",
                    "error"
                );
                return;
            }

            await loadCampaigns();
        }
    );
}

// ======================================================
// THEO DOI THAY DOI TAI KHOAN VA MANG
// ======================================================

if (window.ethereum) {
    window.ethereum.on(
        "accountsChanged",
        function (accounts) {
            currentAccount =
                accounts && accounts.length > 0
                    ? accounts[0]
                    : null;

            window.location.reload();
        }
    );

    window.ethereum.on(
        "chainChanged",
        function () {
            window.location.reload();
        }
    );
}

// ======================================================
// KHOI TAO GIAO DIEN BAN DAU
// ======================================================

document.addEventListener(
    "DOMContentLoaded",
    function () {
        console.log("CharityChain da khoi dong.");

        // Tao khu vuc lich su quyên gop.
        ensureDonationHistorySection();

        // Chuyen don vi hien thi sang MON.
        updateMonadCurrencyLabels();

        if (!window.ethereum) {
            console.warn(
                "Chua phat hien MetaMask trong trinh duyet."
            );

            setNotice(
                "Hãy cài đặt hoặc mở khóa MetaMask để kết nối ví.",
                true
            );

            return;
        }

        if (!checkEthers()) {
            return;
        }

        console.log("Da phat hien MetaMask.");
        console.log(
            "Ethers.js version:",
            window.ethers.version
        );

        // Hien thi mang hien tai neu co the doc.
        const initialProvider =
            new window.ethers.BrowserProvider(
                window.ethereum
            );

        initialProvider.getNetwork()
            .then(function (network) {
                const networkName =
                    network.name &&
                    network.name !== "unknown"
                        ? network.name
                        : "Chain ID " + network.chainId.toString();

                const networkElement = $("networkName");

                if (networkElement) {
                    networkElement.textContent = networkName;
                }

                console.log(
                    "Mang hien tai:",
                    networkName
                );
            })
            .catch(function (error) {
                console.warn(
                    "Chua doc duoc mang:",
                    error
                );
            });
    }
);
