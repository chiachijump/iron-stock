# 鐵材配料 - 手機安裝與上傳說明

這個 App 是純網頁（PWA），手機可以像 App 一樣使用，且**離線（沒網路）也能計算**，因為所有運算都在手機本機完成。

要讓 iPhone 能訪問，需要先上傳到免費的 GitHub Pages。**只需做一次**，之後永久使用。

---

## 第一步：註冊 GitHub 帳號（約 5 分鐘）

1. 手機或電腦瀏覽器打開 https://github.com
2. 點「Sign up」
3. 填 email、密碼、你的名字
4. 完成 email 驗證（收到驗證信後點連結）
5. 完成後就有一個免費帳號（**不需信用卡**）

> 建議用電腦操作這一步，之後上傳檔案比較方便。

---

## 第二步：建立一個新的 Repository（程式庫）

1. 登入 GitHub 後，點右上角「＋」→「New repository」
2. Repository name 輸入：`iron-stock`（可以自己取名，用小寫英文）
3. 選擇 **Public**（公開，免費方案需要的才能開 Pages）
4. 其他都不用動，直接按下方綠色「Create repository」

---

## 第三步：上傳檔案

建立這個 repo 你有兩種方式可以選：

### 方式 A：直接在網頁上傳（最簡單，適合少量檔案）

1. 在剛建立的 repo 頁面，點「uploading an existing file」（或「Add file」→「Upload files」）
2. 把你電腦上 `test` 資料夾裡的**這些檔案**拖曳進去：
   - `index.html`
   - `style.css`
   - `app.js`
   - `manifest.webmanifest`
   - `sw.js`
   - `icons/`（這是一個資料夾，裡面有兩個圖示檔）
3. 上傳後按「Commit changes」完成

> 上傳時務必保留資料夾結構（icons 資料夾要一起上傳）。

### 方式 B：用電腦上傳整個資料夾（較可靠，推薦）

如果你會用命令列，可在 `test` 資料夾用 Git 上傳（需要先安裝 Git）。

```bash
cd "C:\Users\Shuqing\OneDrive\桌面\test"
git init
git add .
git commit -m "初始版本"
git branch -M main
git remote add origin https://github.com/你的帳號/iron-stock.git
git push -u origin main
```

---

## 第四步：開啟 GitHub Pages

1. 在 repo 頁面，點上方的 **Settings**
2. 左邊選單找 **Pages**
3. 在「Build and deployment / Source」選 **Deploy from a branch**
4. Branch 選 **main**，資料夾選 **/ (root)**，按 **Save**
5. 等 1~2 分鐘，頁面會顯示你的網址：
   `https://你的帳號.github.io/iron-stock/`

> 如果第一次找不到，重新整理頁面，有時需要幾分鐘。

---

## 第五步：用手機開啟並加到主畫面

1. 用 **iPhone 的 Safari** 打開上方網址
2. 確認網頁正常顯示「鐵材配料」
3. 點 Safari 底部的 **分享** 按鈕（向上箭頭方盒）
4. 往下捲，點 **「加到主畫面」（Add to Home Screen）**
5. 可以取一個名稱，例如「鐵材配料」，點「新增」
6. 主畫面就會出現 App 圖示，點開就能使用

**之後即使手機沒網路（離線），也能正常開啟並計算**，因為所有檔案已被下載到手機。

---

## 之後要更新版本

如果以後我幫你修改了程式，你把新的檔案覆蓋掉舊的上傳（方式 A 或 B），GitHub Pages 會自動更新，手機重新整理就是新版。

---

## 常見問題

**Q：為什麼一定要上傳？不能直接放手機嗎？**
A：iPhone 的 Safari 不允許直接開啟放在手機本機的 HTML 檔案，所以需要先放到網路上，之後靠「加到主畫面」取得離線能力。

**Q：會不會被別人看到我的裁切資料？**
A：你輸入的資料只存在你自己的手機（localStorage），不會上傳到任何伺服器，是安全的。

**Q：之後需要付費嗎？**
A：不用，GitHub 免費方案已足夠，永久免費。
