// ======================================================
// CHARITYCHAIN - UNG DUNG QUYEN GOP TU THIEN
// HTML + CSS + JavaScript + Solidity + MetaMask
// Ethers.js v6
// ======================================================

// THAY BANG DIA CHI SMART CONTRACT SAU KHI DEPLOY.
// Neu chua deploy, de nguyen gia tri nay de kiem tra giao dien.
const CONTRACT_ADDRESS = "0x29a509A687bBFcd0E24a4A01b7EB55dE02D3B94D";

// ABI cua CharityDonation.sol
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

const $ = (id) => document.getElementById(id);

const grid = $("campaignGrid");
const notice = $("notice");

// ======================================================
// KIEM TRA THU VIEN
// ======================================================

function checkEthers() {
    if (typeof window.ethers === "undefined") {
        console.error("Khong tim thay ethers.js.");

        showToast(
            "Không tải được ethers.js. Hãy kiểm tra Internet và tải lại trang.",
            "error"
        );

        return false;
    }

    return true;
}

// ======================================================
// CAC HAM TIEN ICH
// ======================================================

function shortAddress(address) {
    if (!address) {
        return "Chưa kết nối";
    }

    return address.slice(0, 6) + "..." + address.slice(-4);
}

function formatEth(wei, decimals = 4) {
    if (wei === undefined || wei === null) {
        return "0 ETH";
    }

    return Number(window.ethers.formatEther(wei))
        .toLocaleString("vi-VN", {
            maximumFractionDigits: decimals
        }) + " ETH";
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
    if (!button) {
        return;
    }

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
    if (isConnecting) {
        return;
    }

    if (!checkEthers()) {
        return;
    }

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
        // Yeu cau nguoi dung chon tai khoan MetaMask.
        const accounts = await window.ethereum.request({
            method: "eth_requestAccounts"
        });

        if (!accounts || accounts.length === 0) {
            throw new Error("Bạn chưa chọn tài khoản MetaMask.");
        }

        // Tao provider va signer theo Ethers.js v6.
        provider = new window.ethers.BrowserProvider(
            window.ethereum
        );

        signer = await provider.getSigner();

        currentAccount = await signer.getAddress();

        // Lay thong tin mang Blockchain.
        const network = await provider.getNetwork();

        const networkName =
            network.name && network.name !== "unknown"
                ? network.name
                : "Chain ID " + network.chainId.toString();

        updateWalletUI(currentAccount, networkName);

        showToast(
            "Kết nối MetaMask thành công: " +
            shortAddress(currentAccount)
        );

        // Khoi tao Smart Contract neu da co dia chi.
        const ready = initializeContract();

        if (!ready) {
            return;
        }

        setNotice(
            "Đã kết nối ví. Đang kiểm tra Smart Contract...",
            true
        );

        // Kiem tra contract co phan hoi khong.
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

            if (currentAccount) {
                connectBtn.textContent = shortAddress(currentAccount);
            } else {
                connectBtn.textContent = "Kết nối ví";
            }
        }
    }
}

// ======================================================
// TAI DANH SACH CHIEN DICH
// ======================================================

async function loadCampaigns() {
    if (!checkEthers()) {
        return;
    }

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

        const campaigns = [];
        let totalRaised = 0n;

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

            campaigns.push(campaign);

            totalRaised += c.totalRaised;
        }

        if ($("campaignCount")) {
            $("campaignCount").textContent =
                count.toLocaleString("vi-VN");
        }

        if ($("totalRaised")) {
            $("totalRaised").textContent =
                formatEth(totalRaised);
        }

        if (!grid) {
            setNotice(
                "Đã đọc được " + count + " chiến dịch.",
                true
            );

            return;
        }

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

            return;
        }

        grid.innerHTML = campaigns
            .map(function (campaign) {
                return renderCampaign(campaign);
            })
            .join("");

        bindCampaignButtons();

        setNotice(
            "Đã tải thành công " +
            count +
            " chiến dịch từ Blockchain.",
            true
        );

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
                    <p>Kiểm tra địa chỉ Smart Contract và mạng Blockchain.</p>
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
                    placeholder="Số ETH muốn gửi"
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

                <span class="visual-label">
                    CHARITYCHAIN · #${c.id}
                </span>

                <span class="visual-symbol">♡</span>
            </div>

            <div class="campaign-body">

                <div class="campaign-meta">
                    <span>CHIẾN DỊCH #${c.id}</span>
                    <span class="status-pill">
                        ${escapeHtml(status)}
                    </span>
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
                    <div
                        class="progress-fill"
                        style="width:${percent}%"
                    ></div>
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

    // ------------------------------------------
    // NUT QUYEN GOP
    // ------------------------------------------

    document.querySelectorAll(".donate-btn").forEach(
        function (button) {

            button.addEventListener("click", async function () {

                if (!contract || !signer) {
                    showToast(
                        "Hãy kết nối MetaMask trước.",
                        "error"
                    );

                    return;
                }

                const id = Number(button.dataset.id);

                const input = $("donate-" + id);

                const amount = input
                    ? input.value.trim()
                    : "";

                if (
                    !amount ||
                    !Number.isFinite(Number(amount)) ||
                    Number(amount) <= 0
                ) {
                    showToast(
                        "Nhập số ETH lớn hơn 0.",
                        "error"
                    );

                    return;
                }

                let value;

                try {
                    value = window.ethers.parseEther(amount);
                } catch (error) {
                    showToast(
                        "Số ETH không hợp lệ.",
                        "error"
                    );

                    return;
                }

                if (value <= 0n) {
                    showToast(
                        "Số tiền quyên góp phải lớn hơn 0.",
                        "error"
                    );

                    return;
                }

                try {
                    setBusy(button, true, "Đang gửi...");

                    const tx = await contract.donate(id, {
                        value: value
                    });

                    showToast(
                        "Đã gửi giao dịch. Đang chờ xác nhận..."
                    );

                    await tx.wait();

                    showToast("Quyên góp thành công!");

                    if (input) {
                        input.value = "";
                    }

                    await loadCampaigns();

                } catch (error) {
                    console.error("Loi quyen gop:", error);

                    showToast(
                        friendlyError(error),
                        "error"
                    );

                } finally {
                    setBusy(button, false);
                }
            });
        }
    );

    // ------------------------------------------
    // NUT RUT TIEN
    // ------------------------------------------

    document.querySelectorAll(".withdraw-btn").forEach(
        function (button) {

            button.addEventListener("click", async function () {

                if (!contract || !signer) {
                    showToast(
                        "Hãy kết nối MetaMask trước.",
                        "error"
                    );

                    return;
                }

                const id = Number(button.dataset.id);

                const confirmed = window.confirm(
                    "Bạn có chắc muốn rút toàn bộ tiền của chiến dịch #" +
                    id +
                    "?"
                );

                if (!confirmed) {
                    return;
                }

                try {
                    setBusy(
                        button,
                        true,
                        "Đang rút tiền..."
                    );

                    const tx = await contract.withdrawFunds(id);

                    showToast(
                        "Đang chờ xác nhận giao dịch rút tiền..."
                    );

                    await tx.wait();

                    showToast("Rút tiền thành công!");

                    await loadCampaigns();

                } catch (error) {
                    console.error("Loi rut tien:", error);

                    showToast(
                        friendlyError(error),
                        "error"
                    );

                } finally {
                    setBusy(button, false);
                }
            });
        }
    );
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
                    "Mục tiêu ETH không hợp lệ.",
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
// NUT LAM MOI DU LIEU
// ======================================================

const connectBtn = $("connectBtn");

if (connectBtn) {
    connectBtn.addEventListener(
        "click",
        connectWallet
    );
}

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
        console.log("Ethers.js version:", window.ethers.version);

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