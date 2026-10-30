# CharityChain DApp — Hướng dẫn chạy

Website demo môn Blockchain căn bản, sử dụng HTML, CSS, JavaScript, Solidity, ethers.js và MetaMask.

## Tính năng
- Tạo chiến dịch với tên, mô tả, mục tiêu ETH và thời hạn.
- Kết nối MetaMask.
- Quyên góp ETH vào Smart Contract.
- Xem tổng số tiền, mục tiêu, tiến độ, người tạo và hạn chiến dịch.
- Người tạo có thể rút tiền khi chiến dịch đạt mục tiêu.
- Nếu hết hạn mà chưa đạt mục tiêu, người quyên góp có thể tự yêu cầu hoàn lại khoản đóng góp.
- Giao dịch được ghi nhận trên Blockchain.

> Đây là đồ án học tập. Không sử dụng tiền thật hoặc triển khai nhận tiền thật khi chưa được kiểm thử/audit bảo mật.

## 1. Công cụ cần có
- Trình duyệt Chrome/Firefox/Edge.
- MetaMask: https://metamask.io/
- Remix IDE: https://remix.ethereum.org/
- VS Code (khuyến nghị): https://code.visualstudio.com/

## 2. Biên dịch và triển khai Smart Contract
1. Mở Remix IDE.
2. Tạo file `CharityDonation.sol`, sao chép nội dung từ thư mục `contracts/CharityDonation.sol`.
3. Vào tab **Solidity Compiler**, chọn compiler `0.8.20` hoặc bản `0.8.x` tương thích rồi bấm **Compile CharityDonation.sol**.
4. Để website tương tác với MetaMask, chọn một mạng EVM thử nghiệm được MetaMask hỗ trợ (ví dụ Sepolia), chuyển MetaMask sang đúng mạng đó và lấy ETH thử nghiệm từ faucet đáng tin cậy. Không cần và không nên dùng ETH thật.
5. Trong Remix, mở **Deploy & Run Transactions**, ở Environment chọn **Injected Provider - MetaMask** (tên có thể khác nhẹ theo phiên bản), xác nhận MetaMask đang ở mạng thử nghiệm đúng.
6. Chọn contract `CharityDonation`, bấm **Deploy** và xác nhận giao dịch trong MetaMask.
7. Sau khi deploy xong, sao chép địa chỉ contract được Remix hiển thị.

Nếu bạn chỉ muốn kiểm thử logic trong Remix trước, có thể chọn Remix VM. Tuy nhiên, Remix VM không phải mạng mà MetaMask/website có thể truy cập như một mạng công khai; để website chạy qua MetaMask, cần deploy trên mạng EVM mà MetaMask đang kết nối.

## 3. Gắn địa chỉ contract vào website
Mở `app.js`, tìm dòng:

```js
const CONTRACT_ADDRESS = "PASTE_CONTRACT_ADDRESS_HERE";
```

Thay phần `PASTE_CONTRACT_ADDRESS_HERE` bằng địa chỉ vừa deploy, ví dụ:

```js
const CONTRACT_ADDRESS = "0xDiaChiContractCuaBan";
```

Địa chỉ phải là địa chỉ contract thực tế của bạn, không dùng nguyên ví dụ.

## 4. Chạy website
Không nên mở `index.html` bằng cách nhấp đúp nếu trình duyệt chặn một số tính năng. Hãy chạy qua máy chủ web cục bộ:

### Cách A — VS Code Live Server
1. Mở thư mục dự án `charitychain_dapp` bằng VS Code.
2. Cài extension **Live Server** nếu chưa có.
3. Nhấp phải `index.html` → **Open with Live Server**.

### Cách B — Python
Mở Terminal/PowerShell tại thư mục dự án và chạy:

```bash
python -m http.server 5500
```

Sau đó mở `http://localhost:5500`.

Giữ đúng mạng MetaMask đã dùng để deploy contract, bấm **Kết nối ví** rồi **Làm mới dữ liệu**.

## 5. Kịch bản demo trước lớp
1. Kết nối MetaMask trên mạng thử nghiệm.
2. Tạo chiến dịch: mục tiêu `0.01 ETH`, thời hạn 1 ngày.
3. Quyên góp `0.002 ETH` từ ví đang kết nối hoặc một ví khác.
4. Chụp màn hình giao dịch được xác nhận trong MetaMask/Explorer.
5. Kiểm tra số tiền và thanh tiến độ trên website.
6. Để demo rút tiền nhanh, tạo một chiến dịch có mục tiêu thấp hơn số tiền quyên góp (ví dụ mục tiêu `0.001 ETH`, quyên góp `0.002 ETH`), rồi nhấn nút rút tiền từ chính ví tạo chiến dịch.
7. Có thể demo hoàn tiền bằng một chiến dịch chưa đạt mục tiêu sau khi hết hạn. Trong thực tế, không cần đợi nhiều ngày: nếu cần demo nhanh, hãy chỉnh thời hạn trong contract/frontend theo yêu cầu giảng viên và triển khai lại trên mạng thử nghiệm.

## 6. Quy tắc của Smart Contract
- Chiến dịch có thời hạn từ 1 phút đến 365 ngày.
- Chỉ nhận quyên góp khi chiến dịch còn hạn và chưa rút tiền.
- Chỉ người tạo chiến dịch được rút tiền, và chỉ khi đã đạt mục tiêu.
- Nếu hết hạn mà chưa đạt mục tiêu, mỗi người quyên góp có thể tự hoàn lại khoản của mình.
- Đây là mô hình học tập tối giản, chưa có kiểm duyệt chiến dịch, KYC, kiểm toán bảo mật, hoặc bằng chứng về việc sử dụng tiền sau khi rút.

## 7. Lỗi thường gặp
- **Chưa cấu hình contract address:** sửa `CONTRACT_ADDRESS` trong `app.js`.
- **Wrong network / không đọc được contract:** chuyển MetaMask về đúng mạng đã deploy.
- **Insufficient funds:** ví thử nghiệm không đủ ETH để quyên góp và phí gas.
- **Không có MetaMask:** cài MetaMask và tải lại trang.
- **Giao dịch bị từ chối:** kiểm tra thông báo MetaMask và xác nhận đúng mạng.
- **ethers.js không tải được:** cần Internet vì dự án dùng CDN cho ethers.js.

## Cấu trúc thư mục
```text
charitychain_dapp/
├── index.html
├── styles.css
├── app.js
├── README.md
└── contracts/
    └── CharityDonation.sol
```
