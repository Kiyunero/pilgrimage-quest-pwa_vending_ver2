// グローバルスコープの変数宣言
let adScreen, mainContent, adVideo;

// 広告画面に遷移するグローバル関数
function goToAdScreen() {
    if (window.vueApp && window.vueApp.currentUser) {
        window.vueApp.detachUserListener();
    }
    if (mainContent && adScreen && adVideo) {
        mainContent.classList.add('hidden');
        adScreen.style.display = 'block';
        if (adVideo.paused) {
            adVideo.play().catch(e => console.error("Video play failed:", e));
        }
        adVideo.volume = 1.0;
        if (window.vueApp && window.vueApp.activeInfoWindow) {
            window.vueApp.activeInfoWindow.close();
        }
    }
}

// ページ読み込み完了時のイベントリスナー
document.addEventListener('DOMContentLoaded', () => {
    adScreen = document.getElementById('ad-screen');
    mainContent = document.getElementById('main-content');
    adVideo = document.getElementById('ad-video');

    if (!adScreen || !mainContent || !adVideo) {
        console.error("必要なHTML要素が見つかりません。");
        return;
    }

    const adVideos = ['https://firebasestorage.googleapis.com/v0/b/pilgrimage-quest-app.firebasestorage.app/o/ad_01.mp4?alt=media&token=151f3a81-c21d-4b3d-b4af-42796216473c'];
    let currentVideoIndex = 0;

    adVideo.addEventListener('ended', () => {
        currentVideoIndex = (currentVideoIndex + 1) % adVideos.length;
        adVideo.src = adVideos[currentVideoIndex];
        adVideo.play();
    });
    adVideo.src = adVideos[0];
    // videoの自動再生エラーに対応するため、muted属性をHTML側で追加済み
    // adVideo.play().catch(e => console.error("Initial video play failed:", e));


    let inactivityTimer;
    const inactivityTimeout = 90000; // 90秒

    function resetInactivityTimer() {
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(goToAdScreen, inactivityTimeout);
    }

    document.body.addEventListener('click', resetInactivityTimer, true);
    document.body.addEventListener('touchstart', resetInactivityTimer, true);
    document.body.addEventListener('wheel', resetInactivityTimer, { passive: true, capture: true });

    adScreen.addEventListener('click', () => {
        adScreen.style.display = 'none';
        mainContent.classList.remove('hidden');
        resetInactivityTimer();

        let volume = 1.0;
        const fadeOut = setInterval(() => {
            if (volume > 0.1) {
                volume -= 0.1;
                adVideo.volume = volume;
            } else {
                adVideo.pause();
                clearInterval(fadeOut);
            }
        }, 50);
    });
});


// 【重要】Firebaseプロジェクト作成時にコピーした設定情報をここに貼り付けます
const firebaseConfig = {
    apiKey: "AIzaSyBMwntiBddYgfYlGSGfq4uSQIgsV28Vcuo",
    authDomain: "pilgrimage-quest-app.firebaseapp.com",
    projectId: "pilgrimage-quest-app",
    storageBucket: "pilgrimage-quest-app.appspot.com",
    messagingSenderId: "561336243744",
    appId: "1:561336243744:web:01af4523c8af329c004e45"
};

// Firebaseアプリの初期化
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();


// Google Maps APIのコールバック関数
function initMap() {
    const app = Vue.createApp({
        data() {
            return {
                map: null,
                header: null,
                spots: [],
                allQuests: [],
                markers: [],
                activeInfoWindow: null,
                isAnimating: false,
                animationFrameId: null,
                isHeaderExpanded: false,
                isEventDetailVisible: false,
                currentSpotForEvents: null,
                currentSpotEvents: [],
                isQrModalVisible: false,
                currentQrCode: '',
                qrModalCaption: '',
                activeVideoFades: {},
                eventObserver: null,
                isPurchaseModalVisible: false,
                isLodgingModalVisible: false,
                modalTargetSpot: null,
                selectedLodgingPlan: null,
                isAuthModalVisible: false,
                enteredAuthToken: '',
                isTokenLoading: false,
                authErrorMessage: '',
                currentUser: null,
                isRewardModalVisible: false,
                enteredRewardCode: '',
                rewardErrorMessage: '',
                isQuestDetailVisible: false,
                currentQuestForDetail: null,
                userListener: null,
            };
        },
        mounted() {
            this.map = new google.maps.Map(document.getElementById('map'), {
                center: { lat: 35.7100, lng: 139.8107 },
                zoom: 14,
                gestureHandling: 'greedy',
            });

            this.map.addListener('click', () => {
                if (this.activeInfoWindow) {
                    this.activeInfoWindow.close();
                    this.activeInfoWindow = null;
                }
                this.hideEventDetail();
                this.hideQuestDetail();
            });
            
            document.body.addEventListener('click', (event) => {
                if (event.target.matches('.event-btn')) {
                    const spotName = event.target.dataset.spotName;
                    const spotData = this.spots.find(s => s.name === spotName);
                    if (spotData) this.showEventDetail(spotData);
                }
                if (event.target.matches('.start-quest-btn')) {
                    const questId = event.target.dataset.questId;
                    if (questId) this.showQuestDetail(questId);
                }
            });

            this.fetchDataFromFirestore();
        },
        methods: {
            handleBackToAdClick() {
                goToAdScreen();
            },
            async fetchDataFromFirestore() {
                try {
                    const headerDoc = await db.collection('config').doc('header').get();
                    if (headerDoc.exists) {
                        this.header = headerDoc.data();
                    }

                    const spotsSnapshot = await db.collection('spots').get();
                    const questsSnapshot = await db.collection('quests').get();

                    this.allQuests = questsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    
                    const spotsList = [];
                    spotsSnapshot.forEach((doc) => {
                        spotsList.push({ id: doc.id, ...doc.data() });
                    });
                    
                    this.spots = spotsList;
                    this.placeMarkers();

                } catch (error) {
                    console.error("Firestoreからのデータ取得エラー: ", error);
                    alert('データの取得中にエラーが発生しました。');
                }
            },
            placeMarkers() {
                this.markers.forEach(markerInfo => markerInfo.gmapMarker.setMap(null));
                this.markers = [];

                this.spots.forEach(spot => {
                    const position = {
                        lat: parseFloat(spot.latitude),
                        lng: parseFloat(spot.longitude)
                    };
                    
                    const questStatus = this.currentUser ? this.currentUser.questProgress[spot.questId] : undefined;
                    
                    let pinColor = "#EA4335"; // デフォルト（未着手）は赤
                    if (questStatus === 'in_progress') pinColor = "#FBBC04"; // 進行中は黄色
                    if (questStatus === 'completed') pinColor = "#34A853"; // 完了は緑
                    
                    const marker = new google.maps.Marker({
                        position: position,
                        map: this.map,
                        title: spot.name,
                        icon: {
                            path: google.maps.SymbolPath.CIRCLE,
                            scale: 8,
                            fillColor: pinColor,
                            fillOpacity: 1,
                            strokeWeight: 1,
                            strokeColor: '#fff'
                        }
                    });
                    
                    const spotImageHtml = spot.detail_image ? `<img src="${spot.detail_image}" alt="${spot.name}" class="info-window-spot-image">` : '';
                    let spotDetailsHtml = '<div class="info-window-spot-details">';
                    if (spot.comment) spotDetailsHtml += `<p>${spot.comment}</p>`;
                    if (spot.address) spotDetailsHtml += `<p><strong>住所:</strong> ${spot.address}</p>`;
                    if (spot.phone) spotDetailsHtml += `<p><strong>電話:</strong> ${spot.phone}</p>`;
                    if (spot.hours) spotDetailsHtml += `<p><strong>時間:</strong> ${spot.hours}</p>`;
                    spotDetailsHtml += '</div>';

                    let goodsHtml = '';
                    if (spot.goods_name) {
                        goodsHtml = `<div class="info-window-goods"><img src="${spot.goods_image || ''}" alt="${spot.goods_name}" class="info-window-goods-image"><div class="info-window-goods-details"><strong>${spot.goods_name}</strong><span>${spot.goods_price}</span></div></div><button class="info-window-btn purchase" onclick="window.vueApp.showPurchaseModal('${spot.id}')">購入する</button>`;
                    }
                    let lodgingButtonHtml = '';
                    if (spot.lodging_plans && spot.lodging_plans.length > 0) {
                        lodgingButtonHtml = `<button class="info-window-btn lodging" onclick="window.vueApp.showLodgingModal('${spot.id}')">宿泊プランを見る</button>`;
                    }
                    let questButtonHtml = '';
                    if (spot.questId) {
                        questButtonHtml = `<button class="info-window-btn start-quest-btn" data-quest-id="${spot.questId}">クエストを受注する</button>`;
                    }
                    const infoWindow = new google.maps.InfoWindow({
                        content: `
                            <div class="info-window">
                                <h6 class="info-window-header">${spot.name}</h6>
                                <div class="info-window-content">
                                    ${spotImageHtml}
                                    ${spotDetailsHtml}
                                    ${goodsHtml}
                                    ${lodgingButtonHtml}
                                    ${questButtonHtml} 
                                    <button class="event-btn" data-spot-name="${spot.name}">周辺のイベント情報はこちら</button>
                                </div>
                            </div>
                        `
                    });

                    marker.addListener('click', (e) => {
                        this.onSpotClick(spot.name);
                    });

                    this.markers.push({ gmapMarker: marker, infoWindow: infoWindow, spotData: spot });
                });
            },
            onSpotClick(spotName) {
                if (this.isAnimating) {
                    cancelAnimationFrame(this.animationFrameId);
                }
                const target = this.markers.find(m => m.spotData.name === spotName);
                if (target) {
                    this.openInfoWindow(target.infoWindow, target.gmapMarker);
                    const destination = target.gmapMarker.getPosition();
                    this.flyTo(destination, 17.5);
                }
            },
            openInfoWindow(infoWindow, marker) {
                if (this.activeInfoWindow) {
                    this.activeInfoWindow.close();
                }
                infoWindow.open(this.map, marker);
                this.activeInfoWindow = infoWindow;
            },
            easing(t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); },
            flyTo(destination, endZoom) {
                this.isAnimating = true;
                const duration = 1500;
                let startTime = null;
                const p0 = { lat: this.map.getCenter().lat(), lng: this.map.getCenter().lng(), zoom: this.map.getZoom() };
                const p2 = { lat: destination.lat(), lng: destination.lng(), zoom: endZoom };
                
                const frame = (currentTime) => {
                    if (!startTime) startTime = currentTime;
                    const progress = Math.min((currentTime - startTime) / duration, 1);
                    const t = this.easing(progress);

                    const currentLat = (1 - t) * p0.lat + t * p2.lat;
                    const currentLng = (1 - t) * p0.lng + t * p2.lng;
                    const currentZoom = (1 - t) * p0.zoom + t * p2.zoom;

                    this.map.moveCamera({ center: { lat: currentLat, lng: currentLng }, zoom: currentZoom });

                    if (progress < 1) {
                        this.animationFrameId = requestAnimationFrame(frame);
                    } else {
                        this.isAnimating = false;
                    }
                };
                this.animationFrameId = requestAnimationFrame(frame);
            },
            fadeVolume(refName, element, targetVolume, duration = 500) {
                if (!element) return;
                if (this.activeVideoFades[refName]) {
                    clearInterval(this.activeVideoFades[refName]);
                }
                const startVolume = element.volume;
                const interval = 20;
                const step = (targetVolume - startVolume) / (duration / interval);
                this.activeVideoFades[refName] = setInterval(() => {
                    const newVolume = element.volume + step;
                    if ((step > 0 && newVolume >= targetVolume) || (step < 0 && newVolume <= targetVolume)) {
                        element.volume = targetVolume;
                        clearInterval(this.activeVideoFades[refName]);
                        delete this.activeVideoFades[refName];
                    } else {
                        element.volume = newVolume;
                    }
                }, interval);
            },
            showEventDetail(spotData) {
                const events = [];
                for (let i = 1; i <= 3; i++) {
                    if (spotData[`event${i}_name`]) {
                        events.push({
                            name: spotData[`event${i}_name`],
                            datetime: spotData[`event${i}_datetime`],
                            location: spotData[`event${i}_location`],
                            description: spotData[`event${i}_description`],
                            prize: spotData[`event${i}_prize`],
                            qrcode: spotData[`event${i}_qrcode`],
                            image: spotData[`event${i}_image`]
                        });
                    }
                }
                this.currentSpotEvents = events;
                this.currentSpotForEvents = spotData;
                this.isEventDetailVisible = true;
            },
            hideEventDetail() {
                if (this.isEventDetailVisible) {
                    this.isEventDetailVisible = false;
                }
            },
            showQrCode(qrCodeUrl, caption = 'アプリで読み込んでください') {
                this.currentQrCode = qrCodeUrl;
                this.qrModalCaption = caption;
                this.isQrModalVisible = true;
            },
            hideQrCode() {
                this.isQrModalVisible = false;
            },
            async showQuestDetail(questId) {
                try {
                    const questRef = db.collection('quests').doc(questId);
                    const questDoc = await questRef.get();

                    if (questDoc.exists) {
                        const questData = questDoc.data();
                        this.currentQuestForDetail = {
                            title: questData.title,
                            image: questData.image,
                            description: questData.description,
                            clearCondition: questData.clearCondition,
                            qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=QUEST_START::${questId}`
                        };
                        this.isQuestDetailVisible = true;
                    } else {
                        console.error("指定されたクエストが見つかりません:", questId);
                        alert("クエスト情報の読み込みに失敗しました。");
                    }
                } catch (error) {
                    console.error("クエスト情報の取得エラー:", error);
                    alert("エラーが発生しました。");
                }
            },
            hideQuestDetail() {
                this.isQuestDetailVisible = false;
            },
            showPurchaseModal(spotId) {
                this.modalTargetSpot = this.spots.find(s => s.id === spotId);
                if (this.modalTargetSpot) { this.isPurchaseModalVisible = true; }
            },
            hidePurchaseModal() {
                this.isPurchaseModalVisible = false;
            },
            showLodgingModal(spotId) {
                this.modalTargetSpot = this.spots.find(s => s.id === spotId);
                if (this.modalTargetSpot) {
                    this.selectedLodgingPlan = null;
                    this.isLodgingModalVisible = true;
                }
            },
            hideLodgingModal() {
                this.isLodgingModalVisible = false;
            },
            selectLodgingPlan(plan) {
                this.selectedLodgingPlan = plan;
            },
            openLink(url) {
                if (url) {
                    window.open(url, '_blank');
                } else {
                    alert('リンク先が設定されていません。');
                }
            },
            showAuthModal() {
                this.isAuthModalVisible = true;
                this.enteredAuthToken = '';
                this.authErrorMessage = '';
            },
            hideAuthModal() {
                this.isAuthModalVisible = false;
            },
            async loginWithAuthToken() {
                if (this.enteredAuthToken.length !== 6) {
                    this.authErrorMessage = "6桁の数字を入力してください。";
                    return;
                }
                this.isTokenLoading = true;
                this.authErrorMessage = '';
                try {
                    this.detachUserListener();
                    const token = this.enteredAuthToken;
                    const tokenRef = db.collection('authTokens').doc(token);
                    const tokenDoc = await tokenRef.get();
                    if (!tokenDoc.exists) {
                        this.authErrorMessage = "合言葉が正しくありません。";
                        this.isTokenLoading = false;
                        return;
                    }
                    const tokenData = tokenDoc.data();
                    const now = new Date();
                    const expiresAt = tokenData.expiresAt.toDate();
                    if (now > expiresAt) {
                        this.authErrorMessage = "合言葉の有効期限が切れています。スマホで再発行してください。";
                        await tokenRef.delete();
                        this.isTokenLoading = false;
                        return;
                    }
                    const userId = tokenData.userId;
                    
                    const userRef = db.collection('users').doc(userId);
                    this.userListener = userRef.onSnapshot((doc) => {
                        console.log("ユーザーデータが更新されました！");
                        if (doc.exists) {
                            this.currentUser = doc.data();
                        } else {
                            this.currentUser = { userId: userId, questProgress: {} };
                        }
                        this.placeMarkers();
                    }, (error) => {
                        console.error("データベースの監視に失敗しました:", error);
                    });
                    
                    console.log("連携成功！ データベースのリアルタイム監視を開始しました。");
                    this.hideAuthModal();
                    await tokenRef.delete();
                } catch (error) {
                    console.error("連携エラー:", error);
                    this.authErrorMessage = "連携中にエラーが発生しました。";
                } finally {
                    this.isTokenLoading = false;
                }
            },
            detachUserListener() {
                if (this.userListener) {
                    this.userListener();
                    this.userListener = null;
                    this.currentUser = null;
                    this.placeMarkers();
                    console.log("データベースの監視を停止しました。");
                }
            },
            showRewardModal() {
                this.isRewardModalVisible = true;
                this.enteredRewardCode = '';
                this.rewardErrorMessage = '';
            },
            hideRewardModal() {
                this.isRewardModalVisible = false;
            },
            async redeemRewardCode() {
                if (this.enteredRewardCode.length !== 6) {
                    this.rewardErrorMessage = "6桁の数字を入力してください。";
                    return;
                }
                this.isTokenLoading = true;
                this.rewardErrorMessage = '';
                try {
                    const code = this.enteredRewardCode;
                    const tokenRef = db.collection('rewardTokens').doc(code);
                    const tokenDoc = await tokenRef.get();
                    if (!tokenDoc.exists || tokenDoc.data().status !== 'unused') {
                        this.rewardErrorMessage = "無効なコードです。";
                        this.isTokenLoading = false;
                        return;
                    }
                    await tokenRef.update({ status: 'used' });
                    alert("🎉景品交換に成功しました！🎉\n限定商品を購入できます！");
                    this.hideRewardModal();
                } catch (error) {
                    console.error("景品交換エラー:", error);
                    this.rewardErrorMessage = "エラーが発生しました。";
                } finally {
                    this.isTokenLoading = false;
                }
            }
        }
    });
    window.vueApp = app.mount('#app');
}