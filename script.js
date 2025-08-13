// JSONBin.io কনফিগারেশন
const JSONBIN_API = {
    BASE_URL: "https://api.jsonbin.io/v3/b",
    MASTER_KEY: "$2a$10$fnkXj6CO/v2tBDRrr7dL1ujNn3E1Y.y1SY70R49so5rof3sv7ZmUG",
    BIN_ID: "689c8424ae596e708fc91d40"
};

// অ্যাপ্লিকেশন স্টেট
let appState = {
    donors: [],
    config: {
        donationInterval: 90,
        theme: "light",
        notificationEnabled: false
    },
    currentDonor: null,
    searchQuery: "",
    bloodGroupFilter: "",
    eligibilityFilter: "all"
};

// DOM এলিমেন্টস
const donorsListEl = document.getElementById('donorsList');
const donorFormEl = document.getElementById('donorForm');
const donorModalEl = document.getElementById('donorModal');
const settingsModalEl = document.getElementById('settingsModal');
const settingsFormEl = document.getElementById('settingsForm');
const instantSearchEl = document.getElementById('instantSearch');
const bloodGroupFilterEl = document.getElementById('bloodGroupFilter');
const eligibilityFilterEl = document.getElementById('eligibilityFilter');
const resultsTitleEl = document.getElementById('resultsTitle');
const resultsCountEl = document.getElementById('resultsCount');

// ইভেন্ট লিসেনার
document.getElementById('addDonorBtn').addEventListener('click', () => openDonorModal());
document.getElementById('quickSearchBtn').addEventListener('click', () => instantSearchEl.focus());
document.getElementById('settingsBtn').addEventListener('click', () => openSettingsModal());
document.getElementById('helpBtn').addEventListener('click', showHelp);
document.getElementById('cancelBtn').addEventListener('click', () => closeDonorModal());
document.querySelectorAll('.close-btn').forEach(btn => btn.addEventListener('click', closeAllModals));
document.getElementById('addDonationBtn').addEventListener('click', addNewDonation);
document.getElementById('exportDataBtn').addEventListener('click', exportData);
document.getElementById('importDataBtn').addEventListener('click', importData);
document.getElementById('syncDataBtn').addEventListener('click', syncWithCloud);
instantSearchEl.addEventListener('input', handleInstantSearch);
bloodGroupFilterEl.addEventListener('change', updateFilters);
eligibilityFilterEl.addEventListener('change', updateFilters);

// ফর্ম সাবমিশন
donorFormEl.addEventListener('submit', saveDonor);
settingsFormEl.addEventListener('submit', saveSettings);

// অ্যাপ্লিকেশন ইনিশিয়ালাইজেশন
document.addEventListener('DOMContentLoaded', initializeApp);

// ইনিশিয়ালাইজেশন ফাংশন
function initializeApp() {
    loadData();
    applyTheme();
    renderDonorList();
}

// ডেটা লোড ফাংশন
async function loadData() {
    showLoading();
    
    try {
        // প্রথমে লোকাল স্টোরেজ থেকে চেক করুন
        const localData = localStorage.getItem('bloodDonorData');
        if (localData) {
            const parsedData = JSON.parse(localData);
            appState.donors = parsedData.donors || [];
            appState.config = parsedData.config || {
                donationInterval: 90,
                theme: "light",
                notificationEnabled: false
            };
            
            updateUI();
            applyConfig();
        }
        
        // JSONBin.io থেকে ডেটা সিঙ্ক করুন
        await syncWithCloud();
    } catch (error) {
        console.error("ডেটা লোড করতে সমস্যা:", error);
        showAlert("error", "ডেটা লোড করতে সমস্যা হয়েছে। ইন্টারনেট কানেকশন চেক করুন।");
    } finally {
        hideLoading();
    }
}

// ক্লাউডে ডেটা সিঙ্ক করুন
async function syncWithCloud() {
    try {
        const response = await fetch(`${JSONBIN_API.BASE_URL}/${JSONBIN_API.BIN_ID}/latest`, {
            headers: {
                "X-Master-Key": JSONBIN_API.MASTER_KEY,
                "X-Bin-Meta": false
            }
        });
        
        if (!response.ok) throw new Error('ডেটা লোড করতে ব্যর্থ');
        
        const cloudData = await response.json();
        
        if (cloudData) {
            // লোকাল ডেটার সাথে ক্লাউড ডেটা মার্জ করুন
            const mergedDonors = mergeDonors(appState.donors, cloudData.donors || []);
            
            appState.donors = mergedDonors;
            appState.config = cloudData.config || appState.config;
            
            saveDataToLocal();
            updateUI();
            applyConfig();
            
            showAlert("success", "ডেটা সফলভাবে সিঙ্ক করা হয়েছে");
        }
    } catch (error) {
        console.error("ক্লাউড সিঙ্ক করতে সমস্যা:", error);
        showAlert("warning", "ক্লাউডে সিঙ্ক করতে সমস্যা হয়েছে। লোকাল ডেটা ব্যবহার করা হচ্ছে।");
    }
}

// ডোনার ডেটা মার্জ করুন
function mergeDonors(localDonors, cloudDonors) {
    const merged = [...localDonors];
    const localIds = new Set(localDonors.map(d => d.id));
    
    cloudDonors.forEach(cloudDonor => {
        if (!localIds.has(cloudDonor.id)) {
            merged.push(cloudDonor);
        } else {
            // একই আইডি থাকলে লোকাল ডেটাকে প্রাধান্য দিন
            const existingIndex = merged.findIndex(d => d.id === cloudDonor.id);
            if (existingIndex !== -1) {
                // শুধুমাত্র নতুন ডোনেশন যোগ করুন
                const newDonations = cloudDonor.donations.filter(d => 
                    !merged[existingIndex].donations.includes(d)
                );
                merged[existingIndex].donations = [
                    ...merged[existingIndex].donations,
                    ...newDonations
                ].sort((a, b) => new Date(b) - new Date(a));
            }
        }
    });
    
    return merged;
}

// ডেটা সেভ ফাংশন
function saveDataToLocal() {
    const dataToSave = {
        donors: appState.donors,
        config: appState.config
    };
    
    localStorage.setItem('bloodDonorData', JSON.stringify(dataToSave));
}

async function saveDataToCloud() {
    const dataToSave = {
        donors: appState.donors,
        config: appState.config
    };
    
    try {
        const response = await fetch(`${JSONBIN_API.BASE_URL}/${JSONBIN_API.BIN_ID}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "X-Master-Key": JSONBIN_API.MASTER_KEY
            },
            body: JSON.stringify(dataToSave)
        });
        
        if (!response.ok) throw new Error('ডেটা সেভ করতে ব্যর্থ');
        return true;
    } catch (error) {
        console.error("ডেটা সেভ করতে সমস্যা:", error);
        return false;
    }
}

// UI আপডেট ফাংশন
function updateUI() {
    renderDonorList();
    updateDashboardStats();
}

// ডোনার লিস্ট রেন্ডার
function renderDonorList() {
    const filteredDonors = filterDonors();
    
    donorsListEl.innerHTML = '';
    
    if (filteredDonors.length === 0) {
        showNoResults();
        return;
    }
    
    filteredDonors.forEach(donor => {
        const donorCard = createDonorCard(donor);
        donorsListEl.appendChild(donorCard);
    });
    
    updateResultsInfo(filteredDonors.length);
}

// ফিল্টার ডোনার
function filterDonors() {
    const searchQuery = appState.searchQuery.toLowerCase();
    const bloodGroup = appState.bloodGroupFilter;
    const eligibility = appState.eligibilityFilter;
    const today = new Date();
    
    return appState.donors.filter(donor => {
        // সার্চ কুয়েরি ম্যাচ
        const nameMatch = donor.name.toLowerCase().includes(searchQuery);
        const phoneMatch = donor.phone.includes(searchQuery);
        const bloodMatch = donor.bloodGroup.toLowerCase().includes(searchQuery);
        const searchMatch = nameMatch || phoneMatch || bloodMatch;
        
        // রক্তের গ্রুপ ম্যাচ
        const bloodGroupMatch = bloodGroup === '' || donor.bloodGroup === bloodGroup;
        
        // এলিজিবিলিটি ম্যাচ
        let eligibilityMatch = true;
        if (eligibility !== 'all') {
            const lastDonation = donor.donations && donor.donations.length > 0 ? 
                new Date(donor.donations[donor.donations.length - 1]) : new Date(0);
            
            const nextEligibleDate = new Date(lastDonation);
            nextEligibleDate.setDate(nextEligibleDate.getDate() + appState.config.donationInterval);
            
            if (eligibility === 'eligible') {
                eligibilityMatch = nextEligibleDate <= today;
            } else if (eligibility === 'soon') {
                const nextWeek = new Date();
                nextWeek.setDate(nextWeek.getDate() + 7);
                eligibilityMatch = nextEligibleDate > today && nextEligibleDate <= nextWeek;
            }
        }
        
        return searchMatch && bloodGroupMatch && eligibilityMatch;
    });
}

// ডোনার কার্ড তৈরি করুন
function createDonorCard(donor) {
    const lastDonation = donor.donations && donor.donations.length > 0 ? 
        new Date(donor.donations[donor.donations.length - 1]) : new Date(0);
    
    const nextEligibleDate = new Date(lastDonation);
    nextEligibleDate.setDate(nextEligibleDate.getDate() + appState.config.donationInterval);
    
    const today = new Date();
    const daysUntilEligible = Math.ceil((nextEligibleDate - today) / (1000 * 60 * 60 * 24));
    
    let eligibilityClass, eligibilityText;
    
    if (daysUntilEligible <= 0) {
        eligibilityClass = 'eligible';
        eligibilityText = 'আজ রক্তদানে উপযুক্ত';
    } else if (daysUntilEligible <= 7) {
        eligibilityClass = 'soon';
        eligibilityText = `${daysUntilEligible} দিন পর উপযুক্ত`;
    } else {
        eligibilityClass = 'not-eligible';
        eligibilityText = `${daysUntilEligible} দিন পর উপযুক্ত`;
    }
    
    const donorCard = document.createElement('div');
    donorCard.className = 'donor-card';
    donorCard.innerHTML = `
        <div class="donor-header">
            <div>
                <div class="donor-name">${donor.name}</div>
                <div class="donor-id">${donor.id}</div>
            </div>
            <span class="donor-blood">${donor.bloodGroup}</span>
        </div>
        
        <div class="donor-info">
            <p><i class="fas fa-phone"></i> ${donor.phone}</p>
            <p><i class="fas fa-map-marker-alt"></i> ${donor.location}</p>
            <p><i class="fas fa-calendar-day"></i> সর্বশেষ দান: ${formatDate(lastDonation)}</p>
            <p><i class="fas fa-calendar-check"></i> পরবর্তী দান: ${formatDate(nextEligibleDate)}</p>
        </div>
        
        <div class="donor-eligibility">
            <span class="eligibility-badge ${eligibilityClass}">${eligibilityText}</span>
        </div>
        
        <div class="donor-actions">
            <button class="contact-btn" data-phone="${donor.phone}">
                <i class="fas fa-phone"></i> কল করুন
            </button>
            <button class="details-btn" data-id="${donor.id}">
                <i class="fas fa-info-circle"></i> বিস্তারিত
            </button>
        </div>
    `;
    
    // যোগাযোগ বাটনে ইভেন্ট যোগ করুন
    donorCard.querySelector('.contact-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const phone = e.currentTarget.getAttribute('data-phone');
        if (confirm(`${donor.name} (${donor.bloodGroup}) কে ${phone} নম্বরে কল করতে চান?`)) {
            window.open(`tel:${phone}`);
        }
    });
    
    // বিস্তারিত বাটনে ইভেন্ট যোগ করুন
    donorCard.querySelector('.details-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const donorId = e.currentTarget.getAttribute('data-id');
        const donor = appState.donors.find(d => d.id === donorId);
        if (donor) openDonorModal(donor);
    });
    
    // সম্পূর্ণ কার্ডে ক্লিক ইভেন্ট
    donorCard.addEventListener('click', () => {
        showDonorDetails(donor);
    });
    
    return donorCard;
}

// ডোনার বিস্তারিত দেখান
function showDonorDetails(donor) {
    const lastDonation = donor.donations && donor.donations.length > 0 ? 
        new Date(donor.donations[donor.donations.length - 1]) : new Date(0);
    
    const nextEligibleDate = new Date(lastDonation);
    nextEligibleDate.setDate(nextEligibleDate.getDate() + appState.config.donationInterval);
    
    const today = new Date();
    const daysUntilEligible = Math.ceil((nextEligibleDate - today) / (1000 * 60 * 60 * 24));
    
    let eligibilityText;
    if (daysUntilEligible <= 0) {
        eligibilityText = 'এই ডোনার আজই রক্তদান করতে পারেন';
    } else {
        eligibilityText = `এই ডোনার ${daysUntilEligible} দিন পর রক্তদান করতে পারবেন`;
    }
    
    const detailMessage = `
        <strong>নাম:</strong> ${donor.name}<br>
        <strong>রক্তের গ্রুপ:</strong> ${donor.bloodGroup}<br>
        <strong>ফোন:</strong> ${donor.phone}<br>
        <strong>অবস্থান:</strong> ${donor.location}<br>
        <strong>সর্বশেষ রক্তদান:</strong> ${formatDate(lastDonation)}<br>
        <strong>পরবর্তী রক্তদানের তারিখ:</strong> ${formatDate(nextEligibleDate)}<br><br>
        <strong>স্ট্যাটাস:</strong> ${eligibilityText}
    `;
    
    showAlert("info", detailMessage, donor.name + " - ডোনার বিস্তারিত");
}

// রেজাল্ট ইনফো আপডেট করুন
function updateResultsInfo(count) {
    resultsCountEl.textContent = `${count} জন পাওয়া গেছে`;
    
    let titleText = "উপযুক্ত রক্তদাতাদের তালিকা";
    if (appState.searchQuery) {
        titleText = `"${appState.searchQuery}" এর ফলাফল`;
    } else if (appState.bloodGroupFilter) {
        titleText = `${appState.bloodGroupFilter} গ্রুপের ডোনার`;
    }
    
    if (appState.eligibilityFilter === 'eligible') {
        titleText += " (আজ উপযুক্ত)";
    } else if (appState.eligibilityFilter === 'soon') {
        titleText += " (৭ দিনে উপযুক্ত)";
    }
    
    resultsTitleEl.textContent = titleText;
}

// কোনো রেজাল্ট না পাওয়া গেলে
function showNoResults() {
    donorsListEl.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-user-friends"></i>
            <p>কোনো ডোনার পাওয়া যায়নি। অনুগ্রহ করে সার্চ ক্রাইটেরিয়া পরিবর্তন করুন।</p>
            <button class="primary-btn" id="addNewDonorBtn">
                <i class="fas fa-user-plus"></i> নতুন ডোনার যোগ করুন
            </button>
        </div>
    `;
    
    document.getElementById('addNewDonorBtn').addEventListener('click', () => openDonorModal());
}

// ড্যাশবোর্ড স্ট্যাটস আপডেট
function updateDashboardStats() {
    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    
    const eligibleDonors = appState.donors.filter(donor => {
        if (!donor.donations || donor.donations.length === 0) return true;
        
        const lastDonation = new Date(donor.donations[donor.donations.length - 1]);
        const nextEligibleDate = new Date(lastDonation);
        nextEligibleDate.setDate(nextEligibleDate.getDate() + appState.config.donationInterval);
        
        return nextEligibleDate <= today;
    });
    
    const upcomingDonors = appState.donors.filter(donor => {
        if (!donor.donations || donor.donations.length === 0) return false;
        
        const lastDonation = new Date(donor.donations[donor.donations.length - 1]);
        const nextEligibleDate = new Date(lastDonation);
        nextEligibleDate.setDate(nextEligibleDate.getDate() + appState.config.donationInterval);
        
        return nextEligibleDate > today && nextEligibleDate <= nextWeek;
    });
    
    document.getElementById('totalDonors').textContent = appState.donors.length;
    document.getElementById('eligibleToday').textContent = eligibleDonors.length;
    document.getElementById('upcomingEligible').textContent = upcomingDonors.length;
}

// ইনস্ট্যান্ট সার্চ হ্যান্ডলার
function handleInstantSearch(e) {
    appState.searchQuery = e.target.value;
    renderDonorList();
}

// ফিল্টার আপডেট
function updateFilters() {
    appState.bloodGroupFilter = bloodGroupFilterEl.value;
    appState.eligibilityFilter = eligibilityFilterEl.value;
    renderDonorList();
}

// ডোনার মোডাল ওপেন
function openDonorModal(donor = null) {
    appState.currentDonor = donor;
    
    if (donor) {
        document.getElementById('modalTitle').innerHTML = `<i class="fas fa-user-edit"></i> ${donor.name} - প্রোফাইল`;
        document.getElementById('donorId').value = donor.id;
        document.getElementById('name').value = donor.name || '';
        document.getElementById('age').value = donor.age || '';
        document.getElementById('bloodGroup').value = donor.bloodGroup || '';
        document.getElementById('phone').value = donor.phone || '';
        document.getElementById('location').value = donor.location || '';
        document.getElementById('notes').value = donor.notes || '';
        
        const lastDonation = donor.donations && donor.donations.length > 0 ? 
            donor.donations[donor.donations.length - 1] : new Date().toISOString().split('T')[0];
        
        document.getElementById('lastDonation').value = lastDonation;
        renderDonationHistory(donor.donations || []);
        document.getElementById('donationHistory').style.display = 'block';
    } else {
        document.getElementById('modalTitle').innerHTML = '<i class="fas fa-user-plus"></i> নতুন ডোনার যোগ করুন';
        donorFormEl.reset();
        document.getElementById('donorId').value = generateDonorId();
        document.getElementById('lastDonation').value = new Date().toISOString().split('T')[0];
        document.getElementById('donationHistory').style.display = 'none';
    }
    
    donorModalEl.style.display = 'block';
}

// ডোনার আইডি জেনারেট করুন
function generateDonorId() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    let id = 'DNR-';
    
    // 3 random letters
    for (let i = 0; i < 3; i++) {
        id += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    
    // 4 random numbers
    for (let i = 0; i < 4; i++) {
        id += numbers.charAt(Math.floor(Math.random() * numbers.length));
    }
    
    return id;
}

// ডোনার সেভ
async function saveDonor(e) {
    e.preventDefault();
    showLoading();
    
    const donorData = {
        id: document.getElementById('donorId').value,
        name: document.getElementById('name').value,
        age: parseInt(document.getElementById('age').value),
        bloodGroup: document.getElementById('bloodGroup').value,
        phone: document.getElementById('phone').value,
        location: document.getElementById('location').value,
        notes: document.getElementById('notes').value,
        donations: [],
        createdAt: new Date().toISOString()
    };
    
    const lastDonation = document.getElementById('lastDonation').value;
    if (lastDonation) donorData.donations.push(lastDonation);
    
    try {
        if (appState.currentDonor) {
            // Update existing donor
            donorData.donations = [...appState.currentDonor.donations];
            if (lastDonation !== appState.currentDonor.donations[appState.currentDonor.donations.length - 1]) {
                donorData.donations[donorData.donations.length - 1] = lastDonation;
            }
            
            const index = appState.donors.findIndex(d => d.id === appState.currentDonor.id);
            if (index !== -1) appState.donors[index] = donorData;
        } else {
            // Add new donor
            appState.donors.push(donorData);
        }
        
        // লোকাল এবং ক্লাউডে সেভ করুন
        saveDataToLocal();
        const cloudSaved = await saveDataToCloud();
        
        updateUI();
        closeDonorModal();
        
        showAlert("success", `ডোনার প্রোফাইল সফলভাবে ${appState.currentDonor ? 'আপডেট' : 'যোগ'} করা হয়েছে`);
        
        if (!cloudSaved) {
            showAlert("warning", "ডেটা ক্লাউডে সেভ করতে সমস্যা হয়েছে, শুধুমাত্র লোকালে সেভ করা হয়েছে");
        }
    } catch (error) {
        console.error("ডোনার সেভ করতে সমস্যা:", error);
        showAlert("error", "ডোনার সেভ করতে সমস্যা হয়েছে");
    } finally {
        hideLoading();
    }
}

// নতুন রক্তদান যোগ করুন
async function addNewDonation() {
    const donationDate = prompt("রক্তদানের তারিখ ইনপুট করুন (YYYY-MM-DD):", new Date().toISOString().split('T')[0]);
    
    if (donationDate) {
        showLoading();
        
        try {
            if (!appState.currentDonor.donations) {
                appState.currentDonor.donations = [];
            }
            
            appState.currentDonor.donations.push(donationDate);
            appState.currentDonor.donations.sort((a, b) => new Date(b) - new Date(a));
            
            // লোকাল এবং ক্লাউডে সেভ করুন
            saveDataToLocal();
            const cloudSaved = await saveDataToCloud();
            
            renderDonationHistory(appState.currentDonor.donations);
            updateUI();
            
            showAlert("success", "রক্তদানের তথ্য সফলভাবে যোগ করা হয়েছে");
            
            if (!cloudSaved) {
                showAlert("warning", "ডেটা ক্লাউডে সেভ করতে সমস্যা হয়েছে, শুধুমাত্র লোকালে সেভ করা হয়েছে");
            }
        } catch (error) {
            console.error("রক্তদান যোগ করতে সমস্যা:", error);
            showAlert("error", "রক্তদান যোগ করতে সমস্যা হয়েছে");
        } finally {
            hideLoading();
        }
    }
}

// রক্তদানের ইতিহাস রেন্ডার
function renderDonationHistory(donations = []) {
    const historyListEl = document.getElementById('historyList');
    historyListEl.innerHTML = '';
    
    if (donations.length === 0) {
        historyListEl.innerHTML = '<li class="no-history">কোনো রক্তদানের রেকর্ড নেই</li>';
        return;
    }
    
    // তারিখ অনুযায়ী সর্ট করুন (নতুন থেকে পুরানো)
    const sortedDonations = [...donations].sort((a, b) => new Date(b) - new Date(a));
    
    sortedDonations.forEach(date => {
        const li = document.createElement('li');
        li.textContent = formatDate(new Date(date));
        historyListEl.appendChild(li);
    });
}

// সেটিংস মোডাল ওপেন
function openSettingsModal() {
    document.getElementById('donationInterval').value = appState.config.donationInterval;
    document.querySelector(`input[name="theme"][value="${appState.config.theme}"]`).checked = true;
    settingsModalEl.style.display = 'block';
}

// সেটিংস সেভ
async function saveSettings(e) {
    e.preventDefault();
    showLoading();
    
    try {
        appState.config = {
            donationInterval: parseInt(document.getElementById('donationInterval').value),
            theme: document.querySelector('input[name="theme"]:checked').value,
            notificationEnabled: appState.config.notificationEnabled
        };
        
        // লোকাল এবং ক্লাউডে সেভ করুন
        saveDataToLocal();
        const cloudSaved = await saveDataToCloud();
        
        applyConfig();
        closeSettingsModal();
        
        showAlert("success", "সেটিংস সফলভাবে আপডেট করা হয়েছে");
        
        if (!cloudSaved) {
            showAlert("warning", "সেটিংস ক্লাউডে সেভ করতে সমস্যা হয়েছে, শুধুমাত্র লোকালে সেভ করা হয়েছে");
        }
    } catch (error) {
        console.error("সেটিংস সেভ করতে সমস্যা:", error);
        showAlert("error", "সেটিংস সেভ করতে সমস্যা হয়েছে");
    } finally {
        hideLoading();
    }
}

// কনফিগ অ্যাপ্লাই
function applyConfig() {
    applyTheme();
    renderDonorList();
}

// থিম অ্যাপ্লাই
function applyTheme() {
    if (appState.config.theme === 'dark') {
        document.body.classList.add('dark-theme');
    } else {
        document.body.classList.remove('dark-theme');
    }
}

// ডেটা এক্সপোর্ট
function exportData() {
    const data = {
        donors: appState.donors,
        config: appState.config
    };
    
    const dataStr = JSON.stringify(data, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `blood-donor-data-${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
}

// ডেটা ইম্পোর্ট
function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async e => {
        const file = e.target.files[0];
        const reader = new FileReader();
        
        reader.onload = async event => {
            showLoading();
            
            try {
                const importedData = JSON.parse(event.target.result);
                
                if (!importedData.donors || !Array.isArray(importedData.donors)) {
                    throw new Error("অবৈধ ডেটা ফরম্যাট");
                }
                
                if (confirm(`আপনি কি ${importedData.donors.length} ডোনারের ডেটা ইম্পোর্ট করতে চান?`)) {
                    appState.donors = importedData.donors || [];
                    appState.config = importedData.config || {
                        donationInterval: 90,
                        theme: "light",
                        notificationEnabled: false
                    };
                    
                    // লোকাল এবং ক্লাউডে সেভ করুন
                    saveDataToLocal();
                    const cloudSaved = await saveDataToCloud();
                    
                    updateUI();
                    applyConfig();
                    
                    showAlert("success", "ডেটা সফলভাবে ইম্পোর্ট করা হয়েছে");
                    
                    if (!cloudSaved) {
                        showAlert("warning", "ডেটা ক্লাউডে সেভ করতে সমস্যা হয়েছে, শুধুমাত্র লোকালে সেভ করা হয়েছে");
                    }
                }
            } catch (error) {
                console.error("ডেটা ইম্পোর্ট করতে সমস্যা:", error);
                showAlert("error", "ডেটা ইম্পোর্ট করতে সমস্যা হয়েছে। ফাইলটি সঠিক ফরম্যাটে নেই।");
            } finally {
                hideLoading();
            }
        };
        
        reader.readAsText(file);
    };
    
    input.click();
}

// সাহায্য দেখান
function showHelp() {
    const helpMessage = `
        <strong>রক্তদাতা নেটওয়ার্ক ব্যবহার নির্দেশিকা</strong><br><br>
        
        <strong>১. নতুন ডোনার যোগ:</strong><br>
        - "ডোনার যোগ করুন" বাটনে ক্লিক করুন<br>
        - ফর্মটি পূরণ করুন এবং সেভ করুন<br><br>
        
        <strong>২. রক্তদাতা খুঁজুন:</strong><br>
        - সার্চ বারে নাম, ফোন বা রক্তের গ্রুপ লিখুন<br>
        - ফিল্টার ব্যবহার করে আজ উপযুক্ত বা শীঘ্রই উপযুক্ত ডোনার খুঁজুন<br><br>
        
        <strong>৩. রক্তদান আপডেট:</strong><br>
        - ডোনার প্রোফাইলে গিয়ে "নতুন রক্তদান যোগ করুন" বাটনে ক্লিক করুন<br>
        - সর্বশেষ রক্তদানের তারিখ ইনপুট করুন<br><br>
        
        <strong>৪. ডেটা ম্যানেজমেন্ট:</strong><br>
        - সেটিংস থেকে ডেটা এক্সপোর্ট/ইম্পোর্ট করতে পারবেন<br>
        - ক্লাউডে ডেটা সিঙ্ক করতে "সিঙ্ক করুন" বাটন ব্যবহার করুন
    `;
    
    showAlert("info", helpMessage, "সাহায্য কেন্দ্র");
}

// মোডাল বন্ধ করুন
function closeAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.style.display = 'none';
    });
}

// লোডিং স্টেট দেখান
function showLoading() {
    // ইমপ্লিমেন্ট লোডিং স্টেট
    console.log("Loading...");
}

function hideLoading() {
    // লোডিং স্টেট লুকান
    console.log("Loading complete");
}

// এলার্ট দেখান
function showAlert(type, message, title = "") {
    let icon, color;
    
    switch (type) {
        case "success":
            icon = "fas fa-check-circle";
            color = "#2ecc71";
            break;
        case "error":
            icon = "fas fa-times-circle";
            color = "#e74c3c";
            break;
        case "warning":
            icon = "fas fa-exclamation-triangle";
            color = "#f39c12";
            break;
        default:
            icon = "fas fa-info-circle";
            color = "#3498db";
    }
    
    const alertBox = document.createElement('div');
    alertBox.className = 'custom-alert';
    alertBox.style.backgroundColor = `${color}20`;
    alertBox.style.borderLeft = `4px solid ${color}`;
    
    if (title) {
        alertBox.innerHTML = `
            <div class="alert-header">
                <i class="${icon}" style="color: ${color}"></i>
                <h3>${title}</h3>
            </div>
            <div class="alert-message">${message}</div>
        `;
    } else {
        alertBox.innerHTML = `
            <div class="alert-content">
                <i class="${icon}" style="color: ${color}"></i>
                <div class="alert-message">${message}</div>
            </div>
        `;
    }
    
    document.body.appendChild(alertBox);
    
    setTimeout(() => {
        alertBox.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        alertBox.classList.remove('show');
        setTimeout(() => {
            alertBox.remove();
        }, 300);
    }, 5000);
}

// তারিখ ফরম্যাট করুন
function formatDate(date) {
    if (!(date instanceof Date) || isNaN(date)) return 'N/A';
    
    const options = { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        weekday: 'short'
    };
    
    return date.toLocaleDateString('bn-BD', options);
}

// ডোনার মোডাল বন্ধ করুন
function closeDonorModal() {
    donorModalEl.style.display = 'none';
    appState.currentDonor = null;
}
