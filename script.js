// ===========================================================
// Dream TopUp - Main Application Script
// Handles: Auth, Products, Orders, Payments, UI navigation
// Requires: config.js must be loaded BEFORE this file
// ===========================================================

    let currentUser = null;
    let userBalance = 0;
    let selectedProduct = null;
    let howToVideoId = "dQw4w9WgXcQ"; // Default video ID

    // --- Load How to Add Money Video from Admin Panel ---
    function loadHowToVideo() {
        db.collection("settings").doc("videos").get().then((doc) => {
            if (doc.exists && doc.data().howToAddMoney) {
                howToVideoId = doc.data().howToAddMoney;
                updateVideoFrame();
            }
        }).catch((error) => {
            console.log("Error loading video settings:", error);
        });
    }

    // --- Update Video Frame ---
    function updateVideoFrame() {
        const videoFrame = document.getElementById("new-tutorial-video");
        if (videoFrame) {
            videoFrame.src = `https://www.youtube.com/embed/${howToVideoId}`;
        }
        const oldFrame = document.getElementById("how-to-add-money-video");
        if(oldFrame) oldFrame.src = `https://www.youtube.com/embed/${howToVideoId}`;
    }
    let selectedGameId = null;
    let selectedGameName = "";
    let selectedGameType = 'uid';
    let gamesData = {};
    // ✅ Auto Payment Flag
    let isAutoPayEnabled = false;
    // ✅ New State for Payment Selection
    let selectedPaymentMethod = 'wallet'; // 'wallet' or 'instant'
    // ✅ State to track if we are in Direct Buy mode (Instant Pay)
    let isDirectBuy = false;
    let pendingDirectOrder = null;


    function loadGlobalSettings() {
        db.collection("settings").doc("general").onSnapshot((doc) => {
            if (doc.exists) {
                const data = doc.data();
                const logoUrl = data.logoUrl || "https://placehold.co/150x50?text=No+Logo";
                const siteName = data.siteName || "Nenox Shop";
                
                isAutoPayEnabled = data.autoPayEnabled === true;
                
                // document.getElementById('auth-logo-img').src = logoUrl; // Removed in new UI
                document.getElementById('header-logo-img').src = logoUrl;
                document.getElementById('about-logo-img').src = logoUrl;
                document.getElementById('about-site-name').innerText = siteName;

                // Sync logos for new payment UI
                document.getElementById('step2-logo').src = logoUrl;
                document.getElementById('step2-center-logo').src = logoUrl;
                document.getElementById('pay-site-logo-small').src = logoUrl;

                document.title = siteName;
            }
        });
    }
    loadGlobalSettings();
    loadHowToVideo();

    // --- 2. AUTH LOGIC ---
    function toggleAuth(view) {
        if(view === 'login') {
            document.getElementById('login-view').classList.remove('hidden');
            document.getElementById('register-view').classList.add('hidden');
        } else {
            document.getElementById('login-view').classList.add('hidden');
            document.getElementById('register-view').classList.remove('hidden');
        }
    }

    function handleRegister() {
        const name = document.getElementById('reg-name').value;
        const email = document.getElementById('reg-email').value;
        const pass = document.getElementById('reg-pass').value;
        if(!name || !email || !pass) return Swal.fire('Error', 'Please fill all fields', 'error');

        Swal.showLoading();
        auth.createUserWithEmailAndPassword(email, pass)
            .then((cred) => db.collection('users').doc(cred.user.uid).set({
                name: name, email: email, balance: 0, createdAt: new Date()
            }))
            .then(() => {
                Swal.fire('Success', 'Account Created!', 'success');
                showSec('home');
            })
            .catch((err) => Swal.fire('Error', err.message, 'error'));
    }

    function handleLogin() {
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-pass').value;
        if(!email || !pass) return;
        Swal.showLoading();
        auth.signInWithEmailAndPassword(email, pass)
        .then(() => {
            showSec('home');
            Swal.close();
        })
        .catch((err) => Swal.fire('Login Failed', err.message, 'error'));
    }
    
    // Google Login Function
    function handleGoogleLogin() {
        var provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).then((result) => {
            const user = result.user;
            // Check if user doc exists, if not create it
            const userRef = db.collection('users').doc(user.uid);
            userRef.get().then((docSnapshot) => {
                if (!docSnapshot.exists) {
                    userRef.set({
                        name: user.displayName,
                        email: user.email,
                        balance: 0,
                        createdAt: new Date(),
                        photoURL: user.photoURL
                    });
                }
            });
            showSec('home');
            Swal.fire({
                position: 'top-end',
                icon: 'success',
                title: 'Logged in successfully',
                showConfirmButton: false,
                timer: 1500
            });
        }).catch((error) => {
            Swal.fire('Error', error.message, 'error');
        });
    }

    function showAuthPage() {
        showSec('auth');
    }

    function handleLogout() { 
        auth.signOut().then(() => {
             showSec('home');
        }); 
    }

    auth.onAuthStateChanged((user) => {
        if (user) {
            currentUser = user;
            // Check if currently on auth page, if so go home
            if(!document.getElementById('auth-sec').classList.contains('hidden')){
                showSec('home');
            }
            
            document.getElementById('header-login-container').classList.add('hidden');
            document.getElementById('header-balance-container').classList.remove('hidden');
            
            loadUserData(user.uid);
            calculateUserStats(user.uid);
        } else {
            currentUser = null;
            document.getElementById('header-login-container').classList.remove('hidden');
            document.getElementById('header-balance-container').classList.add('hidden');
            
            // Reset profile data
            const emptyName = "-";
            if(document.getElementById('acc-profile-name')) document.getElementById('acc-profile-name').innerText = emptyName;
            if(document.getElementById('acc-email')) document.getElementById('acc-email').innerText = emptyName;
        }
    });
    
    // Always load content
    loadAppContent();

    function loadUserData(uid) {
        db.collection('users').doc(uid).onSnapshot((doc) => {
            if (doc.exists) {
                const data = doc.data();
                userBalance = data.balance || 0;
                const userName = data.name || "User";
                const userEmail = data.email || "";

                // Update Header
                document.getElementById('header-balance').innerText = userBalance;
                document.getElementById('topup-balance-display').innerText = userBalance.toFixed(2);

                // Update New Account Section
                const accNameEl = document.getElementById('acc-profile-name');
                const accEmailEl = document.getElementById('acc-email');
                const accBalEl = document.getElementById('acc-profile-balance');
                const accBalCardEl = document.getElementById('acc-balance-card');
                const accPinEl = document.getElementById('acc-support-pin');
                
                // Profile Image / Initial Logic
                const imgContainer = document.getElementById('acc-profile-img');
                const initialContainer = document.getElementById('profile-initial');
                
                if(data.photoURL) {
                    imgContainer.src = data.photoURL;
                    imgContainer.classList.remove('hidden');
                    initialContainer.classList.add('hidden');
                } else {
                    imgContainer.classList.add('hidden');
                    initialContainer.classList.remove('hidden');
                    initialContainer.innerText = userName.charAt(0).toUpperCase();
                }

                if(accNameEl) accNameEl.innerText = userName;
                if(accEmailEl) accEmailEl.innerText = userEmail;
                if(accBalEl) accBalEl.innerText = userBalance;
                if(accBalCardEl) accBalCardEl.innerText = userBalance.toFixed(2);
                
                // Generate Support Pin from UID (Real Info)
                if(accPinEl) accPinEl.innerText = uid.substring(0, 6).toUpperCase();
            }
        });
    }

    function calculateUserStats(uid) {
        const totalOrdersEl = document.getElementById('acc-total-orders');
        const totalSpentEl = document.getElementById('acc-total-spent');
        const weeklySpentEl = document.getElementById('acc-weekly-spent');

        if(totalOrdersEl) totalOrdersEl.innerText = "0";
        if(totalSpentEl) totalSpentEl.innerText = "0";
        if(weeklySpentEl) weeklySpentEl.innerText = "0";
        
        db.collection('orders').where('userId', '==', uid).get().then((snapshot) => {
            let totalOrders = 0;
            let totalSpent = 0;
            let weeklySpent = 0;

            const now = new Date();
            const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

            snapshot.forEach((doc) => {
                const data = doc.data();
                totalOrders++;
                const status = data.status ? data.status.toLowerCase() : '';
                
                if (status === 'success' || status === 'complete' || status === 'completed' || status === 'pending') {
                    const price = parseInt(data.price || 0);
                    totalSpent += price;

                    // Calculate Weekly Spent (Real Info)
                    if (data.date) {
                        const orderDate = data.date.toDate ? data.date.toDate() : new Date(data.date);
                        if (orderDate >= oneWeekAgo) {
                            weeklySpent += price;
                        }
                    }
                }
            });

            if(totalOrdersEl) totalOrdersEl.innerText = totalOrders;
            if(totalSpentEl) totalSpentEl.innerText = totalSpent;
            if(weeklySpentEl) weeklySpentEl.innerText = weeklySpent;

        }).catch(err => {
            console.error("Stats Error:", err);
        });
    }

    // --- 3. APP CONTENT & FEATURES ---

    function loadAppContent() {
        db.collection("settings").doc("general").onSnapshot((doc) => {
            if(doc.exists) {
                const data = doc.data();
                if(data.notice) document.getElementById('notice-text').innerText = data.notice;
                const waNum = data.whatsapp ? String(data.whatsapp).replace(/\s/g, '') : "0";
                const tgLink = data.telegram || "#";
                const appLink = data.appLink || "#";
                const fbLink = data.facebook || "#";
                const ytLink = data.youtube || "#";
                const waLink = `https://wa.me/${waNum}`;

                const promoContainer = document.getElementById('promo-banner-container');
                const promoImg = document.getElementById('promo-banner-img');
                const promoLink = document.getElementById('promo-banner-link');
                if(data.promoImageUrl && promoContainer && promoImg && promoLink) {
                    promoImg.src = data.promoImageUrl;
                    promoLink.href = data.promoImageLink || "#";
                    promoContainer.classList.remove('hidden');
                } else if(promoContainer) {
                    promoContainer.classList.add('hidden');
                }

                document.getElementById('home-whatsapp').href = waLink;
                document.getElementById('home-telegram').href = tgLink;
                
                const homeAppBtn = document.getElementById('home-app-dl');
                homeAppBtn.href = appLink;
                homeAppBtn.onclick = (e) => { if(appLink === "#") { e.preventDefault(); Swal.fire('Notice', 'App coming soon!', 'info'); } };

                document.getElementById('link-whatsapp').href = waLink;
                document.getElementById('link-telegram').href = tgLink;

                document.getElementById('about-facebook').href = fbLink;
                document.getElementById('about-youtube').href = ytLink;
                document.getElementById('about-telegram').href = tgLink;
                document.getElementById('about-whatsapp').href = waLink;
                document.getElementById('contact-whatsapp').href = waLink;
                document.getElementById('contact-telegram').href = tgLink;
                document.getElementById('contact-facebook').href = fbLink;
            }
        });

        loadGamesAndCategories();
        loadTutorials();
        loadBanners();
        loadRecentOrdersGlobal(); 
    }

    async function loadGamesAndCategories() {
        const listContainer = document.getElementById('services-list');
        listContainer.innerHTML = `<div class="text-center py-10"><i class="fas fa-spinner fa-spin text-sky-500"></i> Loading Games...</div>`;
        gamesData = {};

        try {
            const [categoriesSnap, servicesSnap] = await Promise.all([
                db.collection("categories").orderBy("slot").get(),
                db.collection("services").get()
            ]);

            if (servicesSnap.empty) {
                listContainer.innerHTML = `<div class="col-span-3 text-center text-gray-700">No Games Found</div>`;
                return;
            }

            const categoriesMap = new Map();
            categoriesSnap.forEach(doc => {
                categoriesMap.set(doc.id, { ...doc.data(), games: [] });
            });
            
            let uncategorizedGames = [];

            servicesSnap.forEach(doc => {
                const game = { id: doc.id, ...doc.data() };
                gamesData[doc.id] = game;
                
                if (game.categoryId && categoriesMap.has(game.categoryId)) {
                    categoriesMap.get(game.categoryId).games.push(game);
                } else {
                    uncategorizedGames.push(game);
                }
            });

            listContainer.innerHTML = "";

            categoriesMap.forEach((category) => {
                if (category.games.length > 0) {
                    let gamesHTML = '';
                    category.games.forEach(item => {
                        gamesHTML += `
                         <div onclick="openTopUpPage('${item.id}', '${item.name}', '${item.image}')" 
                              class="bg-white rounded-lg shadow-[0_2px_0px_0px_rgba(3,169,244,0.5)] overflow-hidden cursor-pointer transform hover:-translate-y-1 transition-all duration-300 border border-gray-100 group">
                            <div class="w-full aspect-square bg-gray-50 overflow-hidden relative">
                                <img src="${item.image}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" onerror="this.src='https://placehold.co/200'">
                            </div>
                            <div class="p-2 text-center bg-white border-t border-gray-50">
                                <p class="text-xs font-bold text-gray-700 line-clamp-2 leading-tight lang-auto">${item.name}</p>
                            </div>
                        </div>`;
                    });

                    listContainer.innerHTML += `
                    <div>
                        <h3 class="font-bold text-gray-700 text-xl mb-3 text-center lang-auto" style="letter-spacing: 0.5px">${category.name}</h3>
                        <div class="grid grid-cols-3 gap-6 px-4">
                            ${gamesHTML}
                        </div>
                    </div>`;
                }
            });
            
             if(uncategorizedGames.length > 0) {
                let gamesHTML = '';
                uncategorizedGames.forEach(item => {
                    gamesHTML += `
                     <div onclick="openTopUpPage('${item.id}', '${item.name}', '${item.image}')" 
                          class="bg-white rounded-lg shadow-[0_2px_0px_0px_rgba(3,169,244,0.5)] overflow-hidden cursor-pointer transform hover:-translate-y-1 transition-all duration-300 border border-gray-100 group">
                        <div class="w-full aspect-square bg-gray-50 overflow-hidden relative">
                            <img src="${item.image}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" onerror="this.src='https://placehold.co/200'">
                        </div>
                        <div class="p-1 text-center bg-white border-t border-gray-50">
                            <p class="text-[8px] font-bold text-gray-700 truncate">${item.name}</p>
                        </div>
                    </div>`;
                });
                listContainer.innerHTML += `
                <div>
                    <h3 class="font-bold text-gray-500 text-lg border-l-4 border-gray-400 pl-2 mb-3">Others</h3>
                    <div class="grid grid-cols-3 gap-6 px-4">
                        ${gamesHTML}
                    </div>
                </div>`;
            }

        } catch (error) {
            console.error("Failed to load games and categories:", error);
            listContainer.innerHTML = `<div class="text-center text-red-500">Failed to load games. Please try again later.</div>`;
        }
    }

    function loadTutorials() {
        db.collection("tutorials").onSnapshot((snapshot) => {
            const container = document.getElementById('tutorial-list-container');
            container.innerHTML = "";
            
            if (snapshot.empty) {
                container.innerHTML = `
                    <div class="text-center py-12">
                        <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i class="fas fa-video text-gray-700 text-2xl"></i>
                        </div>
                        <p class="text-gray-500 text-sm">No tutorials available yet</p>
                    </div>
                `;
                return;
            }
            
            snapshot.forEach(doc => {
                const data = doc.data();
                container.innerHTML += `
                    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all duration-300 group">
                        <div class="relative" onclick="window.open('${data.link}', '_blank')">
                            <div class="aspect-video bg-gray-100 overflow-hidden">
                                <img src="${data.thumbnail}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
                            </div>
                            <div class="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                <div class="bg-white/90 backdrop-blur-sm rounded-full w-14 h-14 flex items-center justify-center shadow-lg">
                                    <i class="fas fa-play text-sky-600 text-xl ml-1"></i>
                                </div>
                            </div>
                            <div class="absolute top-3 right-3 bg-black/60 text-white px-2 py-1 rounded-full text-xs font-medium backdrop-blur-sm">
                                <i class="fas fa-play mr-1"></i> Tutorial
                            </div>
                        </div>
                        <div class="p-4">
                            <h3 class="font-semibold text-gray-800 text-sm leading-tight line-clamp-2">${data.title}</h3>
                            <div class="mt-3 flex items-center justify-between">
                                <span class="text-xs text-gray-500">
                                    <i class="fas fa-clock mr-1"></i> Watch now
                                </span>
                                <button onclick="window.open('${data.link}', '_blank')" class="bg-sky-50 text-sky-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-sky-100 transition-colors">
                                    <i class="fas fa-external-link-alt mr-1"></i> Watch
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            });
        });
    }

    // --- 4. TOPUP SYSTEM ---
    function openTopUpPage(gameId, gameName, gameImg) {
        // ALLOW GUESTS TO VIEW PAGE - Removed login check here
        
        selectedGameId = gameId;
        selectedGameName = gameName;
        selectedProduct = null;
        selectedGameType = gamesData[gameId].type || 'uid'; 
        
        // Reset Logic
        selectPaymentOption('wallet'); // Default to wallet
        isDirectBuy = false;

        document.getElementById('total-price').innerText = "0";
        document.getElementById('game-player-id').value = "";
        document.getElementById('topup-game-title').innerText = gameName;
        document.getElementById('topup-sub-title').innerText = gameName + " ";
        document.getElementById('topup-game-img').src = gameImg;

        const playerSection = document.getElementById('player-id-section');
        playerSection.classList.toggle('hidden', selectedGameType === 'code');
        
        if (selectedGameType === 'code') {
            document.getElementById('topup-sub-title').innerText += "(Instant Voucher)";
        } else if (selectedGameType === 'auto-topup') {
            document.getElementById('topup-sub-title').innerText += "(Auto Delivery)";
        } else {
            document.getElementById('topup-sub-title').innerText += "(Player ID)";
        }

        const rulesBox = document.getElementById('game-rules-box');
        const rulesText = document.getElementById('game-rules-text');
        if(gamesData[gameId] && gamesData[gameId].rules) {
            // Split rules by newline or period for bullet points if needed, or just set innerText
            const rules = gamesData[gameId].rules.split('\n');
            let rulesHtml = "";
            rules.forEach(rule => {
                if(rule.trim()) rulesHtml += `<p class="flex items-start gap-1"><i class="far fa-dot-circle mt-1 text-[8px] text-gray-400"></i> ${rule}</p>`;
            });
            rulesText.innerHTML = rulesHtml || gamesData[gameId].rules;
            rulesBox.classList.remove('hidden');
        } else {
            rulesBox.classList.add('hidden');
        }
        
        const uidCheckBtn = document.getElementById('uidCheckBtn');
        uidCheckBtn.innerHTML = "Click to check player name";
        uidCheckBtn.classList.remove("bg-black");
        uidCheckBtn.classList.add("bg-gradient-to-r", "from-red-700", "to-orange-500");

        showSec('topup');
        
        const grid = document.getElementById('products-grid');
        const loader = document.getElementById('product-loader');
        grid.innerHTML = "";
        loader.classList.remove('hidden');

        db.collection('services').doc(gameId).collection('products').orderBy('price', 'asc').get()
            .then((snapshot) => {
                loader.classList.add('hidden');
                if(snapshot.empty) {
                    grid.innerHTML = `<div class="col-span-2 text-center text-gray-700 py-4">No packages available</div>`;
                    return;
                }
                snapshot.forEach(doc => {
                    const prod = doc.data();
                    const card = document.createElement('div');
                    card.className = "product-card";
                    card.onclick = () => selectProduct(card, prod.name, prod.price, doc.id);
                    
                    let stockBadge = "";
                    if(selectedGameType === 'code' || selectedGameType === 'auto-topup') {
                         const count = prod.stockCount || 0;
                         stockBadge = (count > 0) ? `` : `<span class="text-[9px] text-red-500 bg-red-100 px-1 rounded ml-1">Stock Out</span>`;
                    }

                    card.innerHTML = `
                        <div class="flex items-center">
                            <div class="product-bullet"></div>
                            <div>
                                <span class="text-xs font-bold text-gray-600 block">${prod.name} ${stockBadge}</span>
                            </div>
                        </div>
                        <span class="text-sky-600 font-bold text-sm">৳${prod.price}</span>`;
                    grid.appendChild(card);
                });
            });
    }

    function selectProduct(element, name, price, id) {
        document.querySelectorAll('.product-card').forEach(el => el.classList.remove('selected'));
        element.classList.add('selected');
        selectedProduct = { id: id, name: name, price: parseInt(price) };
        document.getElementById('total-price').innerText = selectedProduct.price;
    }

    function selectPaymentOption(option) {
        selectedPaymentMethod = option;
        document.querySelectorAll('.pay-option-card').forEach(el => el.classList.remove('selected'));
        document.getElementById('opt-' + option).classList.add('selected');
    }

    async function processOrder() {
        // CHECK LOGIN HERE BEFORE PROCESSING
        if (!currentUser) {
            Swal.fire({
                title: 'Login Required',
                text: 'Please login to purchase this item',
                icon: 'info',
                confirmButtonText: 'Login',
                showCancelButton: true,
                cancelButtonText: 'Cancel'
            }).then((result) => {
                if (result.isConfirmed) {
                    showSec('auth');
                }
            });
            return;
        }

        let playerId = "N/A";
        
        if(selectedGameType === 'uid' || selectedGameType === 'auto-topup') {
            playerId = document.getElementById('game-player-id').value.trim();
            if(!playerId) return Swal.fire({ icon: 'warning', title: 'Missing ID', text: 'Please enter Player ID!' });
        } else {
            playerId = "Voucher Request";
        }
        
        if(!selectedProduct) return Swal.fire({ icon: 'warning', title: 'Select Pack', text: 'Please select a recharge package!' });
        
        // --- LOGIC BRANCHING START ---
        
        if (selectedPaymentMethod === 'instant') {
            // INSTANT PAY FLOW
            isDirectBuy = true;
            currentDepositAmount = selectedProduct.price;
            pendingDirectOrder = {
                playerId: playerId,
                product: selectedProduct,
                gameId: selectedGameId,
                gameName: selectedGameName,
                gameType: selectedGameType
            };
            
            // Go directly to Method Step of Add Money (reusing UI)
            document.getElementById('topup-sec').classList.add('hidden');
            
            // FIX: Must show the parent section first!
            document.getElementById('addmoney-sec').classList.remove('hidden');
            
            // Then manage the steps inside
            document.getElementById('am-step-1').classList.add('hidden');
            document.getElementById('am-step-2').classList.remove('hidden');
            document.getElementById('am-step-3').classList.add('hidden');
            
            window.scrollTo({ top: 0, behavior: 'instant' });
            return;
        }

        // --- WALLET PAY FLOW (Existing Logic) ---
        if(userBalance < selectedProduct.price) return Swal.fire({ icon: 'error', title: 'Low Balance', text: 'Please Add Money first.' });

        const result = await Swal.fire({
            title: 'Confirm Purchase?',
            html: `Item: ${selectedProduct.name}<br>Price: ৳${selectedProduct.price}`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#03a9f4',
            confirmButtonText: 'Yes, Buy Now'
        });

        if (result.isConfirmed) {
            Swal.showLoading();
            if (selectedGameType === 'code') {
                processVoucherOrder(playerId);
            } else if (selectedGameType === 'auto-topup') {
                processAutoTopUpOrder(playerId);
            } else {
                processUidOrder(playerId);
            }
        }
    }
    
    // Updated to accept playerId param for code reuse
    async function processVoucherOrder(playerId) {
        const stockRef = db.collection('services').doc(selectedGameId).collection('products').doc(selectedProduct.id).collection('stock');
        const availableStockSnap = await stockRef.where('status', '==', 'available').limit(1).get();

        if (availableStockSnap.empty) {
            return Swal.fire('Out of Stock', 'Sorry, this product is currently unavailable.', 'error');
        }

        const stockDoc = availableStockSnap.docs[0];
        const voucherCode = stockDoc.data().code;
        const userRef = db.collection('users').doc(currentUser.uid);
        
        try {
            await db.runTransaction(async (t) => {
                const uDoc = await t.get(userRef);
                const newBal = uDoc.data().balance - selectedProduct.price;
                if(newBal < 0) throw new Error("Insufficient Balance");

                t.update(userRef, { balance: newBal });
                t.delete(stockDoc.ref); 
                t.update(db.collection('services').doc(selectedGameId).collection('products').doc(selectedProduct.id), {
                    stockCount: firebase.firestore.FieldValue.increment(-1)
                });
            });

            await db.collection('orders').add({
                userId: currentUser.uid, userName: currentUser.email, gameName: selectedGameName, gameId: selectedGameId,
                productName: selectedProduct.name, price: selectedProduct.price, playerId: playerId, type: 'code',
                status: 'success', redeemCode: voucherCode, date: new Date()
            });

            Swal.fire('Success', 'Voucher Purchased! Check History for Code.', 'success');
            showSec('home');

        } catch (e) {
            Swal.fire('Error', 'Transaction Failed: ' + e.message, 'error');
        }
    }

    function processUidOrder(playerId) {
        const newBalance = userBalance - selectedProduct.price;
        db.collection('users').doc(currentUser.uid).update({ balance: newBalance })
        .then(() => {
            return db.collection('orders').add({
                userId: currentUser.uid, userName: currentUser.email, gameName: selectedGameName, gameId: selectedGameId,
                playerId: playerId, productName: selectedProduct.name, price: selectedProduct.price, type: 'uid',
                status: 'pending', date: new Date()
            });
        })
        .then(() => {
            Swal.fire('Success', 'Order Placed Successfully!', 'success');
            showSec('home');
        })
        .catch(err => Swal.fire('Error', err.message, 'error'));
    }

    async function processAutoTopUpOrder(playerId) {
        const settingsDoc = await db.collection("settings").doc("general").get();
        if (!settingsDoc.exists) {
            return Swal.fire('Configuration Error', 'Admin settings not found. Please contact support.', 'error');
        }
        const settings = settingsDoc.data();
        const apiKey = settings.autoTopUpApiKey;
        const apiUrl = settings.autoTopUpApiUrl;
        const callbackUrl = settings.autoTopUpCallbackUrl;

        if (!apiKey || !apiUrl || !callbackUrl) {
            return Swal.fire('Configuration Error', 'Auto TopUp is not configured correctly. Please contact support.', 'error');
        }

        const stockRef = db.collection('services').doc(selectedGameId).collection('products').doc(selectedProduct.id).collection('stock');
        const availableStockSnap = await stockRef.where('status', '==', 'available').limit(1).get();

        if (availableStockSnap.empty) {
            return Swal.fire('Out of Stock', 'Sorry, this product is currently unavailable.', 'error');
        }
        const stockDoc = availableStockSnap.docs[0];
        const uniPinCode = stockDoc.data().code;

        const userRef = db.collection('users').doc(currentUser.uid);
        const orderRef = db.collection('orders').doc(); 

        try {
            await db.runTransaction(async (t) => {
                const userDoc = await t.get(userRef);
                const newBalance = userDoc.data().balance - selectedProduct.price;
                if (newBalance < 0) throw new Error("Insufficient Balance");

                t.update(userRef, { balance: newBalance });
                t.delete(stockDoc.ref);
                t.update(db.collection('services').doc(selectedGameId).collection('products').doc(selectedProduct.id), {
                    stockCount: firebase.firestore.FieldValue.increment(-1)
                });
                t.set(orderRef, {
                    userId: currentUser.uid, userName: currentUser.email, gameName: selectedGameName, gameId: selectedGameId,
                    playerId: playerId, productName: selectedProduct.name, price: selectedProduct.price, type: 'auto-topup',
                    status: 'pending', date: new Date(), usedUniPinCode: uniPinCode 
                });
            });

            const payload = {
                api: apiKey,
                playerid: playerId,
                code: uniPinCode,
                orderid: orderRef.id, 
                url: callbackUrl
            };

            fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).catch(err => console.error("Auto TopUp API Error:", err)); 

            Swal.fire({
                icon: 'info',
                title: 'Processing Order',
                text: 'Your top-up is being processed automatically. Please wait.',
                timer: 7000,
                timerProgressBar: true,
                didOpen: () => { Swal.showLoading() }
            });

            setTimeout(() => {
                orderRef.update({ status: 'success' }).then(() => {
                    Swal.fire('Success!', 'Your Top-Up has been completed successfully.', 'success');
                    showSec('home');
                });
            }, 7000);

        } catch (e) {
            Swal.fire('Transaction Failed', e.message, 'error');
        }
    }

    function uidCheck() {
        const uid = document.getElementById("game-player-id").value;
        const box = document.getElementById("uidCheckBtn");

        if (!uid) {
            box.innerHTML = "Please enter a UID!";
            box.classList.remove("bg-gradient-to-r", "from-red-700", "to-orange-500");
            box.classList.add("bg-black");
            return;
        }

        box.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Name is loading...';
        box.classList.remove("bg-gradient-to-r", "from-red-700", "to-orange-500");
        box.classList.add("bg-black");

        const apiURL = `https://bhauxinfo2.vercel.app/bhau?uid=${uid}&region=BD`;

        fetch(apiURL)
            .then(res => res.json())
            .then(data => {
                let name =
                    (data.basicInfo && data.basicInfo.nickname) ||
                    data.nickname ||
                    "Invalid UID ";

                box.innerHTML = name; 
            })
            .catch(() => {
                box.innerHTML = "No nickname found!";
            });
    }

    // --- OTHER HELPERS ---
    function showSec(secId) {
        // Guard restricted sections
        if ((secId === 'history' || secId === 'account' || secId === 'addmoney') && !currentUser) {
            showSec('auth');
            return;
        }

        document.querySelectorAll('main section').forEach(s => s.classList.add('hidden'));
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active-tab'));
        document.getElementById(secId + '-sec').classList.remove('hidden');
        const navBtn = document.getElementById('nav-' + secId);
        if(navBtn) navBtn.classList.add('active-tab');
        
        const noticeSection = document.getElementById('notice-section');
        if(secId === 'home') {
            noticeSection.classList.remove('hidden');
        } else {
            noticeSection.classList.add('hidden');
        }
        
        if(secId === 'addmoney') {
            // Reset to Step 1 every time we enter Add Money section
            isDirectBuy = false; // Reset direct buy flag
            document.getElementById('am-step-1').classList.remove('hidden');
            document.getElementById('am-step-2').classList.add('hidden');
            document.getElementById('am-step-3').classList.add('hidden');
        }
        if(secId === 'history') {
            loadHistory();
        }
        
        window.scrollTo({ top: 0, behavior: 'instant' });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
    }
    
    function loadHistory() {
        const list = document.getElementById('history-list');
        if (!currentUser) return;

        list.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin text-sky-500"></i> Loading History...</div>';

        db.collection('orders').where('userId', '==', currentUser.uid).limit(50).get()
            .then(snapshot => {
                if (snapshot.empty) {
                    list.innerHTML = `<div class="text-center py-8 text-gray-500"><p>No orders found</p></div>`;
                    return;
                }

                const orders = [];
                snapshot.forEach(doc => {
                    orders.push(doc.data());
                });

                orders.sort((a, b) => {
                    const dateA = a.date ? a.date.toDate() : new Date(0);
                    const dateB = b.date ? b.date.toDate() : new Date(0);
                    return dateB - dateA;
                });

                list.innerHTML = "";
                
                orders.forEach(d => {
                    let statusColor = "bg-yellow-100 text-yellow-700 border-yellow-500";
                    let icon = "fa-clock";

                    const status = d.status ? d.status.toLowerCase() : 'pending';
                    if (status === 'success' || status === 'complete' || status === 'completed') {
                        statusColor = "bg-green-100 text-green-700 border-green-500";
                        icon = "fa-check-circle";
                    } else if (status === 'cancel' || status === 'rejected') {
                        statusColor = "bg-red-100 text-red-700 border-red-500";
                        icon = "fa-times-circle";
                    }

                    let dateStr = "N/A";
                    if (d.date && d.date.toDate) {
                        dateStr = d.date.toDate().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true });
                    }

                    let detailsInfo = d.redeemCode ? `
                        <div class="mt-2 bg-green-50 border border-green-200 rounded p-2 text-center">
                            <p class="text-[10px] text-green-600 font-bold uppercase">Your Voucher Code</p>
                            <p class="text-sm font-mono font-bold text-gray-800 select-all tracking-wider break-all">${d.redeemCode}</p>
                        </div>` : `
                        <div class="mt-1 inline-block bg-gray-50 border border-gray-200 rounded px-2 py-0.5">
                            <p class="text-[10px] text-gray-500 font-mono">ID: <span class="text-gray-700 font-bold select-all">${d.playerId}</span></p>
                        </div>`;

                    list.innerHTML += `
                        <div class="bg-white border border-gray-200 rounded-lg mb-3">
                            <div class="p-3">
                                <div class="flex justify-between items-start mb-2">
                                    <div>
                                        <h4 class="font-bold text-gray-800 text-sm">${d.gameName}</h4>
                                        <p class="text-xs text-gray-500">${dateStr}</p>
                                    </div>
                                    <div class="text-right">
                                        <p class="text-lg font-bold text-sky-600">৳${d.price}</p>
                                        <span class="text-xs font-medium ${statusColor.includes('green') ? 'text-green-600' : statusColor.includes('red') ? 'text-red-600' : 'text-yellow-600'}">${d.status}</span>
                                    </div>
                                </div>
                                <div class="border-t border-gray-100 pt-2 mt-2">
                                    <p class="text-xs font-medium text-gray-700 mb-1">${d.productName}</p>
                                    ${detailsInfo}
                                </div>
                            </div>
                        </div>`;
                });
            })
            .catch(error => {
                console.error("Error loading order history: ", error);
                list.innerHTML = `<div class="text-center text-red-500 py-4 text-xs font-mono">Error: ${error.message}</div>`;
            });
    }

    function loadRecentOrdersGlobal() {
        const container = document.getElementById('latest-orders-list');
        db.collection('orders').orderBy('date', 'desc').limit(5)
          .onSnapshot((snapshot) => {
              if (snapshot.empty) {
                  container.innerHTML = '<div class="text-center text-gray-700 text-xs py-2">No recent orders</div>'; return;
              }
              container.innerHTML = ""; 
              snapshot.forEach(doc => {
                  const data = doc.data();
                  let displayName = "Customer";
                  if(data.userName) { displayName = data.userName.includes('@') ? data.userName.split('@')[0] : data.userName; }
                  const firstChar = displayName.charAt(0).toUpperCase();
                  let statusText = (data.status || 'pending').toLowerCase();
                  let statusBadgeClass = 'bg-red-500 text-white';
                  if (['success', 'complete', 'completed'].includes(statusText)) {
                      statusBadgeClass = 'bg-[#198754] text-white';
                      statusText = 'completed';
                  } else if (['pending', 'processing'].includes(statusText)) {
                      statusBadgeClass = 'bg-[#ffc107] text-gray-800';
                      statusText = 'processing';
                  }
                  container.innerHTML += `<div class="bg-white p-3 rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.03)] border border-gray-100 flex items-center justify-between"><div class="flex items-center gap-3 overflow-hidden"><div class="w-11 h-11 min-w-[44px] bg-[#0d6efd] rounded-full flex items-center justify-center text-white text-lg font-sans font-medium shadow-sm">${firstChar}</div><div class="flex flex-col truncate"><span class="text-gray-600 font-bold text-sm truncate">${displayName}</span><span class="text-gray-500 text-[11px] font-medium truncate">${data.productName} - ${data.price} ৳</span></div></div><div class="${statusBadgeClass} px-3 py-1 rounded-full text-[10px] font-bold capitalize shadow-sm whitespace-nowrap ml-2">${statusText}</div></div>`;
              });
          }, (error) => {
               console.error("Error loading recent orders: ", error);
               container.innerHTML = `<div class="text-center text-red-500 py-4 text-xs font-mono">Could not load recent orders.</div>`;
          });
    }

    function toggleFabMenu() {
        const fabContainer = document.getElementById('fab-container');
        const helpText = document.getElementById('fab-help-text');
        fabContainer.classList.toggle('is-open');

        if (fabContainer.classList.contains('is-open')) {
            helpText.classList.add('opacity-0');
        } else {
            helpText.classList.remove('opacity-0');
        }
    }
    
    function loadBanners() {
        db.collection("banners").onSnapshot((snapshot) => {
            const wrapper = document.getElementById('slider-wrapper');
            let slidesHTML = "";
            snapshot.forEach((doc) => { if(doc.data().image) slidesHTML += `<img src="${doc.data().image}" class="w-full h-full object-cover flex-shrink-0">`; });
            if(slidesHTML) { wrapper.innerHTML = slidesHTML; startSlider(); }
        });
    }
    
    let sliderInterval;
    function startSlider() {
        clearInterval(sliderInterval);
        let idx = 0;
        const wrapper = document.getElementById('slider-wrapper');
        const count = wrapper.children.length;
        if(count <= 1) return;
        sliderInterval = setInterval(() => {
            idx = (idx + 1) % count;
            wrapper.style.transform = `translateX(-${idx * 100}%)`;
        }, 3000);
    }

    // ============================================
    // === NEW LOGIC FOR UPDATED ADD MONEY UI ===
    // ============================================

    let currentDepositAmount = 0;
    let currentPaymentMethod = '';

    // Step 1 -> Step 2
    function goToMethodStep() {
        const inputVal = document.getElementById('new-amount-input').value;
        if (!inputVal || inputVal < 10) {
            return Swal.fire('Error', 'Please enter a valid amount (Min 10 Tk)', 'error');
        }
        currentDepositAmount = parseInt(inputVal);
        
        document.getElementById('am-step-1').classList.add('hidden');
        document.getElementById('am-step-2').classList.remove('hidden');
    }

    // Step 2 -> Step 1 (Back)
    function backToAmountStep() {
        if (isDirectBuy) {
            // If in direct buy mode, back goes to TopUp Page
            document.getElementById('am-step-2').classList.add('hidden');
            document.getElementById('addmoney-sec').classList.add('hidden'); // Fix: Hide parent section
            document.getElementById('topup-sec').classList.remove('hidden');
            isDirectBuy = false;
        } else {
            document.getElementById('am-step-2').classList.add('hidden');
            document.getElementById('am-step-1').classList.remove('hidden');
        }
    }

    // Step 2 -> Step 3 (Payment Page)
    function goToPaymentPage(method, themeClass, logoUrl) {
        currentPaymentMethod = method;
        
        // Update UI Elements for Payment Page
        document.getElementById('pay-method-logo').src = logoUrl;
        document.getElementById('pay-amount-display').innerText = currentDepositAmount;
        document.getElementById('pay-amount-text').innerText = currentDepositAmount;
        
        // Update Method Names in Instruction Text
        document.querySelectorAll('.method-name').forEach(el => el.innerText = method);
        
        // Reset and Apply Theme Color
        const themeCard = document.getElementById('payment-theme-card');
        themeCard.className = `rounded-xl shadow-lg overflow-hidden text-white mb-6 relative transition-colors duration-300 ${themeClass}`;

        // Fetch Number from Admin Panel
        document.getElementById('pay-admin-number').innerText = "Loading...";
        db.collection("admin").doc("payment").get().then(doc => {
            if(doc.exists) {
                const num = doc.data()[method.toLowerCase()] || "Not Available";
                document.getElementById('pay-admin-number').innerText = num;
            }
        });

        document.getElementById('am-step-2').classList.add('hidden');
        document.getElementById('am-step-3').classList.remove('hidden');
    }

    // Step 3 -> Step 2 (Back)
    function backToMethodStep() {
        document.getElementById('am-step-3').classList.add('hidden');
        document.getElementById('am-step-2').classList.remove('hidden');
    }

    // Copy Logic
    function copyPayNumber() {
        const num = document.getElementById('pay-admin-number').innerText;
        navigator.clipboard.writeText(num);
        Swal.fire({
            toast: true,
            icon: 'success',
            title: 'Number Copied!',
            position: 'top',
            showConfirmButton: false,
            timer: 1500
        });
    }

    // Main Verify Handler
    function handleNewVerify() {
        const trxId = document.getElementById('pay-trx-input').value.trim();
        
        if (!trxId) {
            return Swal.fire('Required', 'Please enter the Transaction ID.', 'warning');
        }

        if (isAutoPayEnabled) {
            verifyAutoPayment(trxId, currentDepositAmount);
        } else {
            if (isDirectBuy) {
                Swal.fire('Notice', 'Manual verification is not supported for Instant Buy. Please contact support.', 'warning');
            } else {
                submitDeposit(trxId, currentDepositAmount);
            }
        }
    }

    // --- REUSED EXISTING LOGIC FUNCTIONS ---

    // Manual Deposit Logic
    function submitDeposit(trxId, amount) {
        Swal.showLoading();
        db.collection('deposits').add({
            userId: currentUser.uid, 
            amount: parseInt(amount), 
            trxId: trxId.toUpperCase(), 
            status: 'pending', 
            date: new Date(), 
            userEmail: currentUser.email,
            method: currentPaymentMethod
        }).then(() => {
            Swal.fire({
                title: 'Request Submitted', 
                text: 'Your deposit request has been sent. Please wait for admin approval.', 
                icon: 'success',
                confirmButtonColor: '#d33'
            }).then(() => {
                showSec('home'); // Go home after success
            });
        }).catch(err => Swal.fire('Error', err.message, 'error'));
    }

    // Auto Payment Logic
    async function verifyAutoPayment(trxId, amount) {
        trxId = trxId.toUpperCase();
        
        Swal.fire({
            title: 'Verifying...',
            text: 'Please wait while we check your transaction.',
            didOpen: () => { Swal.showLoading() }
        });

        // Step 1: Check duplication
        const existingTrxCheck = await db.collection('deposits').where('trxId', '==', trxId).limit(1).get();
        if (!existingTrxCheck.empty) {
            return Swal.fire('Used', 'This Transaction ID has already been used.', 'error');
        }

        // Step 2: Check Realtime DB
        rtdb.ref('XNXANIKPAY').orderByChild('txid').equalTo(trxId).once('value', async (snapshot) => {
            if (!snapshot.exists()) {
                return Swal.fire('Not Found', 'Transaction ID not found. Please try again or contact support.', 'error');
            }
            
            let paymentData = null;
            snapshot.forEach((childSnapshot) => {
                paymentData = childSnapshot.val();
            });

            // Verify Amount
            if (parseInt(paymentData.amount) !== parseInt(amount)) {
                return Swal.fire('Mismatch', `Amount mismatch! You entered ${amount} but system found ${paymentData.amount}.`, 'error');
            }

            const amountToAdd = parseInt(paymentData.amount);
            const userRef = db.collection('users').doc(currentUser.uid);

            try {
                // 1. Add Balance First
                await db.runTransaction(async (transaction) => {
                    const userDoc = await transaction.get(userRef);
                    const newBalance = (userDoc.data().balance || 0) + amountToAdd;
                    transaction.update(userRef, { balance: newBalance });
                });
                
                await db.collection('deposits').add({
                    userId: currentUser.uid,
                    userEmail: currentUser.email,
                    amount: amountToAdd,
                    trxId: trxId,
                    status: 'approved',
                    method: currentPaymentMethod + ' (Auto)',
                    date: new Date()
                });
                
                // 2. If Direct Buy (Instant Pay), Trigger Order Immediately
                if (isDirectBuy && pendingDirectOrder) {
                    // Update local balance variable immediately so process functions don't fail
                    userBalance += amountToAdd; 
                    
                    Swal.fire({
                        title: 'Payment Verified!',
                        text: 'Processing your order now...',
                        icon: 'success',
                        timer: 2000,
                        showConfirmButton: false
                    });
                    
                    // Trigger the specific order function
                    if (pendingDirectOrder.gameType === 'code') {
                         await processVoucherOrder(pendingDirectOrder.playerId);
                    } else if (pendingDirectOrder.gameType === 'auto-topup') {
                         await processAutoTopUpOrder(pendingDirectOrder.playerId);
                    } else {
                         processUidOrder(pendingDirectOrder.playerId);
                    }
                    
                    isDirectBuy = false;
                    pendingDirectOrder = null;
                } else {
                    Swal.fire('Success', `Successfully added ৳${amountToAdd} to your wallet.`, 'success')
                        .then(() => showSec('home'));
                }
                
            } catch (error) {
                console.error("Auto payment error:", error);
                Swal.fire('Failed', 'System error during balance update. Contact support.', 'error');
            }
        });
    }

