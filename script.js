const menuToggle = document.querySelector(".menu-toggle");
const navLinks = document.querySelector(".nav-links");

if (menuToggle && navLinks) {
    menuToggle.addEventListener("click", () => {
        const isExpanded = menuToggle.getAttribute("aria-expanded") === "true";
        menuToggle.setAttribute("aria-expanded", String(!isExpanded));
        menuToggle.setAttribute("aria-label", isExpanded ? "Open navigation menu" : "Close navigation menu");
        navLinks.classList.toggle("is-open", !isExpanded);
    });

    navLinks.addEventListener("click", (event) => {
        if (event.target instanceof Element && event.target.closest("a")) {
            menuToggle.setAttribute("aria-expanded", "false");
            menuToggle.setAttribute("aria-label", "Open navigation menu");
            navLinks.classList.remove("is-open");
        }
    });
}

const profileStorageKey = "campusSkillswapProfiles";
const currentProfileStorageKey = "campusSkillswapCurrentProfileId";
const swapRequestStorageKey = "campusSkillswapRequests";
const profileForm = document.querySelector("#profile-form");
const profileFormMessage = document.querySelector("#profile-form-message");
const browseProfilesLink = document.querySelector("#browse-profiles-link");

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
}[character]));

const splitList = (value) => value.split(",").map((item) => item.trim()).filter(Boolean);

const isStudentProfile = (profile) => profile
    && typeof profile.id === "string"
    && typeof profile.name === "string"
    && typeof profile.major === "string"
    && typeof profile.bio === "string"
    && Array.isArray(profile.teaches) && profile.teaches.every((item) => typeof item === "string")
    && Array.isArray(profile.learns) && profile.learns.every((item) => typeof item === "string")
    && Array.isArray(profile.interests) && profile.interests.every((item) => typeof item === "string")
    && Array.isArray(profile.categories) && profile.categories.every((item) => typeof item === "string");

const readSavedProfiles = () => {
    const value = localStorage.getItem(profileStorageKey);
    if (!value) {
        return [];
    }
    const profiles = JSON.parse(value);
    if (!Array.isArray(profiles)) {
        throw new Error("Saved profiles are not in the expected format.");
    }
    return profiles.filter(isStudentProfile);
};

const getCurrentProfile = (profiles) => {
    const currentId = localStorage.getItem(currentProfileStorageKey);
    return profiles.find((profile) => profile.id === currentId) || profiles[profiles.length - 1] || null;
};

const saveSwapRequest = (sender, recipient) => {
    const value = localStorage.getItem(swapRequestStorageKey);
    const requests = value ? JSON.parse(value) : [];
    if (!Array.isArray(requests)) {
        throw new Error("Saved swap requests are not in the expected format.");
    }
    const request = {
        id: `swap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        senderId: sender.id,
        senderName: sender.name,
        recipientId: recipient.id,
        recipientName: recipient.name,
        status: "pending",
        createdAt: new Date().toISOString()
    };
    requests.push(request);
    localStorage.setItem(swapRequestStorageKey, JSON.stringify(requests));
    return request;
};

const sendSkillSwapRequest = (recipient) => {
    const currentProfile = getCurrentProfile(readSavedProfiles());
    if (!currentProfile) {
        throw new Error("Create a profile before requesting a skill swap.");
    }
    if (currentProfile.id === recipient.id) {
        throw new Error("You can’t send a skill swap request to your own profile.");
    }
    return saveSwapRequest(currentProfile, recipient);
};

const normalizeSkill = (skill) => skill.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Score the swap in both directions: one point for each skill the student
// teaches that the current user wants, and one for each skill they want that
// the current user can teach. Divide by the user's total teach/learn skills.
const findComplementaryMatches = (currentProfile, candidates) => {
    const currentWants = currentProfile.learns.map((skill) => ({
        skill,
        normalized: normalizeSkill(skill)
    })).filter((item) => item.normalized);
    const currentTeaches = currentProfile.teaches.map((skill) => ({
        skill,
        normalized: normalizeSkill(skill)
    })).filter((item) => item.normalized);
    const totalSwapSkills = currentWants.length + currentTeaches.length;

    if (!totalSwapSkills) {
        return [];
    }

    return candidates
        .filter((student) => student.id !== currentProfile.id)
        .map((student) => {
            const studentTeaches = new Set(student.teaches.map(normalizeSkill));
            const studentLearns = new Set(student.learns.map(normalizeSkill));
            const learnFromStudent = currentWants.filter((item) => studentTeaches.has(item.normalized));
            const teachStudent = currentTeaches.filter((item) => studentLearns.has(item.normalized));
            const matchedCount = learnFromStudent.length + teachStudent.length;

            return {
                student,
                learnFromStudent: learnFromStudent.map((item) => item.skill),
                teachStudent: teachStudent.map((item) => item.skill),
                matchedCount,
                percentage: Math.round((matchedCount / totalSwapSkills) * 100)
            };
        })
        .filter((match) => match.matchedCount > 0)
        .sort((first, second) =>
            second.percentage - first.percentage
            || second.matchedCount - first.matchedCount
            || first.student.name.localeCompare(second.student.name)
        )
        .slice(0, 3);
};

const getProfileCategories = (skills) => {
    const text = skills.join(" ").toLowerCase();
    const categories = [];
    if (/(python|web|javascript|coding|programming|git|data|excel)/.test(text)) categories.push("programming");
    if (/(design|figma|ux|ui)/.test(text)) categories.push("design");
    if (/(canva|illustrat|photo|video|creative|art|editing|podcast)/.test(text)) categories.push("creative");
    if (/(public speaking|presentation|communication|debate|interview)/.test(text)) categories.push("communication");
    if (/(career|study|excel|interview|portfolio)/.test(text)) categories.push("career");
    return categories;
};

if (profileForm instanceof HTMLFormElement && profileFormMessage instanceof HTMLElement) {
    const isEditingProfile = new URLSearchParams(window.location.search).get("edit") === "1";
    let profileBeingEdited = null;

    if (isEditingProfile) {
        try {
            profileBeingEdited = getCurrentProfile(readSavedProfiles());
            if (profileBeingEdited) {
                profileForm.elements.namedItem("fullName").value = profileBeingEdited.name;
                profileForm.elements.namedItem("courseYear").value = profileBeingEdited.major;
                profileForm.elements.namedItem("skillsTeach").value = profileBeingEdited.teaches.join(", ");
                profileForm.elements.namedItem("skillsLearn").value = profileBeingEdited.learns.join(", ");
                profileForm.elements.namedItem("bio").value = profileBeingEdited.bio;
                profileForm.elements.namedItem("interests").value = profileBeingEdited.interests.join(", ");
                profileForm.querySelector("#profile-form-title").textContent = "Edit your student profile";
                profileForm.querySelector(".create-profile-button").innerHTML = "Save Profile Changes <span aria-hidden=\"true\">↗</span>";
            } else {
                profileFormMessage.textContent = "Create a student profile before editing it.";
                profileFormMessage.classList.add("is-error");
            }
        } catch (error) {
            console.error("Unable to load the profile for editing.", error);
            profileFormMessage.textContent = "We couldn’t load your saved profile from this browser.";
            profileFormMessage.classList.add("is-error");
        }
    }

    profileForm.addEventListener("submit", (event) => {
        event.preventDefault();
        profileFormMessage.textContent = "";
        browseProfilesLink?.setAttribute("hidden", "");

        if (!profileForm.reportValidity()) {
            return;
        }

        const formData = new FormData(profileForm);
        const teaches = splitList(String(formData.get("skillsTeach") || ""));
        const learns = splitList(String(formData.get("skillsLearn") || ""));
        const interests = splitList(String(formData.get("interests") || ""));

        if (!teaches.length || !learns.length || !interests.length) {
            profileFormMessage.textContent = "Please enter at least one item in each comma-separated skills and interests field.";
            profileFormMessage.classList.add("is-error");
            return;
        }

        const fullName = String(formData.get("fullName") || "").trim();
        const initials = fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
        const profile = {
            id: profileBeingEdited?.id || `student-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: fullName,
            initials,
            avatar: ["avatar-sage", "avatar-coral", "avatar-lilac", "avatar-blue", "avatar-gold", "avatar-rose"][Date.now() % 6],
            major: String(formData.get("courseYear") || "").trim(),
            teaches,
            learns,
            interests,
            categories: getProfileCategories([...teaches, ...learns]),
            bio: String(formData.get("bio") || "").trim(),
            availability: "Connect to arrange a time"
        };

        try {
            const savedProfiles = readSavedProfiles();
            const existingIndex = savedProfiles.findIndex((savedProfile) => savedProfile.id === profile.id);
            if (existingIndex >= 0) {
                savedProfiles[existingIndex] = profile;
            } else {
                savedProfiles.push(profile);
            }
            localStorage.setItem(profileStorageKey, JSON.stringify(savedProfiles));
            localStorage.setItem(currentProfileStorageKey, profile.id);
        } catch (error) {
            console.error("Unable to save the student profile in localStorage.", error);
            profileFormMessage.textContent = "We couldn’t save your profile in this browser. Check that local storage is available, then try again.";
            profileFormMessage.classList.add("is-error");
            return;
        }

        profileForm.reset();
        profileFormMessage.classList.remove("is-error");
        profileFormMessage.textContent = isEditingProfile
            ? "Your profile has been updated and saved in this browser."
            : "Your profile is ready! It’s saved in this browser and will appear in the skills directory.";
        browseProfilesLink?.removeAttribute("hidden");
        if (browseProfilesLink instanceof HTMLAnchorElement) {
            browseProfilesLink.href = "dashboard.html";
            browseProfilesLink.textContent = isEditingProfile ? "Return to your dashboard ↗" : "Go to your dashboard ↗";
        }
    });
}

const studentGrid = document.querySelector("#student-grid");
const searchForm = document.querySelector(".skill-search");
const searchInput = document.querySelector("#skill-search-input");
const categoryButtons = document.querySelectorAll(".category-chip");
const studentCount = document.querySelector("#student-count");
const emptyResults = document.querySelector("#empty-results");
const clearSearchButton = document.querySelector("#clear-search");
const directoryNotice = document.querySelector("#directory-notice");
const profileDialog = document.querySelector(".profile-dialog");
const profileContent = document.querySelector(".profile-dialog-content");
const findMatchesButton = document.querySelector("#find-matches");
const matchResults = document.querySelector("#match-results");
const matchGrid = document.querySelector("#match-grid");
const matchResultsNote = document.querySelector("#match-results-note");
const closeMatchesButton = document.querySelector("#close-matches");

const students = [
    {
        id: "maya-chen",
        name: "Maya Chen",
        initials: "MC",
        avatar: "avatar-lilac",
        major: "Visual Communication · 3rd year",
        teaches: ["UI / UX design", "Figma", "Canva"],
        learns: ["Python", "Public speaking"],
        categories: ["design", "creative", "programming", "communication"],
        bio: "I love turning big ideas into clear, friendly designs. Happy to walk through Figma basics, portfolio projects, or quick Canva wins.",
        interests: ["Illustration", "Campus magazine", "Coffee shop sketching"],
        availability: "Weekday afternoons · Library or online"
    },
    {
        id: "aarav-patel",
        name: "Aarav Patel",
        initials: "AP",
        avatar: "avatar-sage",
        major: "Computer Science · 2nd year",
        teaches: ["Python", "Web development", "Git basics"],
        learns: ["UI / UX design", "Public speaking"],
        categories: ["programming", "design", "communication"],
        bio: "I enjoy making coding feel less intimidating. Bring a beginner question or a small project and we’ll figure it out together.",
        interests: ["Hackathons", "Board games", "Open-source projects"],
        availability: "Tuesday and Thursday · Student union"
    },
    {
        id: "jordan-rivera",
        name: "Jordan Rivera",
        initials: "JR",
        avatar: "avatar-coral",
        major: "Media Studies · 4th year",
        teaches: ["Public speaking", "Presentation skills", "Podcast editing"],
        learns: ["Python", "Web development"],
        categories: ["communication", "creative", "programming"],
        bio: "I’ve hosted campus events and made more presentations than I can count. Let’s make your next one feel natural.",
        interests: ["Student radio", "Live music", "Film"],
        availability: "Flexible evenings · Arts building"
    },
    {
        id: "priya-nair",
        name: "Priya Nair",
        initials: "PN",
        avatar: "avatar-gold",
        major: "Business Analytics · 3rd year",
        teaches: ["Excel", "Canva", "Study planning"],
        learns: ["UI / UX design", "Photography"],
        categories: ["career", "creative", "design"],
        bio: "I’m all about simple systems that make study weeks feel calmer. I can also show you the Canva shortcuts I use for club projects.",
        interests: ["Entrepreneurship club", "Photography", "Cafe hopping"],
        availability: "Mornings · Campus cafe"
    },
    {
        id: "sam-okafor",
        name: "Sam Okafor",
        initials: "SO",
        avatar: "avatar-blue",
        major: "Software Engineering · 2nd year",
        teaches: ["Web development", "JavaScript", "Python"],
        learns: ["UI / UX design", "Public speaking"],
        categories: ["programming", "design", "communication"],
        bio: "Building little web apps is my favorite way to learn. I can help you get a first site online or make sense of JavaScript.",
        interests: ["Basketball", "Indie games", "Hackathons"],
        availability: "Weekends · Engineering lounge"
    },
    {
        id: "ella-martin",
        name: "Ella Martin",
        initials: "EM",
        avatar: "avatar-rose",
        major: "Fine Arts · 3rd year",
        teaches: ["Digital illustration", "Canva", "Portfolio feedback"],
        learns: ["Web development", "Public speaking"],
        categories: ["creative", "career", "programming", "communication"],
        bio: "I love helping people find a visual style that feels like them. Bring a portfolio draft or an idea you’d like to sketch out.",
        interests: ["Printmaking", "Student gallery", "Thrift shopping"],
        availability: "Wednesday afternoons · Art studio"
    },
    {
        id: "noah-williams",
        name: "Noah Williams",
        initials: "NW",
        avatar: "avatar-sage",
        major: "Economics · 2nd year",
        teaches: ["Public speaking", "Interview practice", "Excel"],
        learns: ["Python", "UI / UX design"],
        categories: ["communication", "career", "programming", "design"],
        bio: "I’m happy to practice interview answers, presentations, or the spreadsheet skills I use for class projects.",
        interests: ["Debate society", "Soccer", "Personal finance"],
        availability: "Monday and Friday · Main quad"
    },
    {
        id: "lina-cho",
        name: "Lina Cho",
        initials: "LC",
        avatar: "avatar-lilac",
        major: "Information Systems · 4th year",
        teaches: ["Python", "Data visualization", "Study planning"],
        learns: ["Canva", "Public speaking"],
        categories: ["programming", "career", "creative", "communication"],
        bio: "I like making data tell a story. We can start with Python basics or turn a class project into a clear chart.",
        interests: ["Data visualization", "Running club", "Documentaries"],
        availability: "Thursday afternoons · Innovation hub"
    },
    {
        id: "mateo-garcia",
        name: "Mateo Garcia",
        initials: "MG",
        avatar: "avatar-coral",
        major: "Computer Science · 3rd year",
        teaches: ["Web development", "Git basics", "Figma"],
        learns: ["Public speaking", "Canva"],
        categories: ["programming", "design", "communication", "creative"],
        bio: "I can help you go from a blank editor to a simple working website, and show you the design handoff tools I use with my team.",
        interests: ["Photography", "Student newspaper", "Futsal"],
        availability: "Tuesday evenings · Online or library"
    }
];

if (studentGrid && searchForm instanceof HTMLFormElement && searchInput instanceof HTMLInputElement) {
    let activeCategory = "all";
    let savedProfiles = [];
    let profileStorageWarning = "";

    try {
        const storedValue = localStorage.getItem(profileStorageKey);
        if (storedValue) {
            const parsedProfiles = JSON.parse(storedValue);
            if (!Array.isArray(parsedProfiles)) {
                throw new Error("Saved profiles are not in the expected format.");
            }
            savedProfiles = parsedProfiles.filter(isStudentProfile);
            if (savedProfiles.length !== parsedProfiles.length) {
                profileStorageWarning = "Some saved profiles couldn’t be displayed because their data was incomplete.";
            }
        }
    } catch (error) {
        console.error("Unable to read student profiles from localStorage.", error);
        profileStorageWarning = "Saved profiles couldn’t be loaded from this browser. Existing student profiles are still available.";
    }

    const directoryStudents = [...students, ...savedProfiles];

    const renderSkills = () => {
        const query = searchInput.value.trim().toLowerCase();
        const matchingStudents = directoryStudents.filter((student) => {
            const searchableText = [
                student.name,
                student.major,
                student.bio,
                ...student.teaches,
                ...student.learns,
                ...student.interests
            ].join(" ").toLowerCase();
            const matchesSearch = !query || searchableText.includes(query);
            const matchesCategory = activeCategory === "all" || student.categories.includes(activeCategory);
            return matchesSearch && matchesCategory;
        });

        studentGrid.innerHTML = matchingStudents.map((student) => `
            <article class="directory-student-card" data-student-id="${escapeHtml(student.id)}">
                <div class="student-card-heading">
                    <span class="student-avatar ${escapeHtml(student.avatar)}" aria-hidden="true">${escapeHtml(student.initials)}</span>
                    <div class="student-heading-copy">
                        <h3>${escapeHtml(student.name)}</h3>
                        <span class="student-meta"><i class="student-online"></i>${escapeHtml(student.major)}</span>
                    </div>
                </div>
                <div class="student-skills-block">
                    <p class="student-label">Can teach</p>
                    <div class="student-skill-list">${student.teaches.map((skill) => `<span class="student-skill">${escapeHtml(skill)}</span>`).join("")}</div>
                </div>
                <div class="student-skills-block">
                    <p class="student-label">Wants to learn</p>
                    <div class="student-skill-list">${student.learns.map((skill) => `<span class="student-skill wants">${escapeHtml(skill)}</span>`).join("")}</div>
                </div>
                <div class="student-card-actions">
                    <button type="button" data-action="profile">View Profile</button>
                    <button class="request-swap" type="button" data-action="request">Request Swap</button>
                </div>
            </article>
        `).join("");

        if (studentCount) {
            studentCount.textContent = `${matchingStudents.length} ${matchingStudents.length === 1 ? "student" : "students"} sharing skills`;
        }
        if (emptyResults instanceof HTMLElement) {
            emptyResults.hidden = matchingStudents.length > 0;
        }
        if (directoryNotice) {
            directoryNotice.textContent = profileStorageWarning;
        }
    };

    searchInput.addEventListener("input", renderSkills);
    searchForm.addEventListener("submit", (event) => {
        event.preventDefault();
        renderSkills();
        studentGrid.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    categoryButtons.forEach((button) => {
        button.addEventListener("click", () => {
            activeCategory = button.dataset.category || "all";
            categoryButtons.forEach((categoryButton) => {
                const isActive = categoryButton === button;
                categoryButton.classList.toggle("is-active", isActive);
                categoryButton.setAttribute("aria-pressed", String(isActive));
            });
            renderSkills();
        });
    });

    clearSearchButton?.addEventListener("click", () => {
        searchInput.value = "";
        activeCategory = "all";
        categoryButtons.forEach((button) => {
            const isActive = button.dataset.category === "all";
            button.classList.toggle("is-active", isActive);
            button.setAttribute("aria-pressed", String(isActive));
        });
        renderSkills();
        searchInput.focus();
    });

    findMatchesButton?.addEventListener("click", () => {
        if (!(matchResults instanceof HTMLElement) || !(matchGrid instanceof HTMLElement) || !matchResultsNote) {
            return;
        }

        matchResults.hidden = false;
        matchGrid.innerHTML = "";

        const currentProfile = getCurrentProfile(savedProfiles);
        if (!currentProfile) {
            matchResultsNote.innerHTML = `Create a profile with skills you can teach and want to learn to get personalized matches. <a href="share-skill.html">Create your profile ↗</a>`;
            matchResults.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }

        const matches = findComplementaryMatches(currentProfile, directoryStudents);
        matchResultsNote.textContent = `Matching against your saved profile, ${currentProfile.name}. We compare skills in both directions.`;

        if (!matches.length) {
            matchGrid.innerHTML = `<p class="match-empty">No complementary matches yet. Try adding more skills to your profile.</p>`;
            matchResults.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }

        matchGrid.innerHTML = matches.map((match, index) => {
            const matchingSkills = [
                ...match.learnFromStudent.map((skill) => `Learn ${escapeHtml(skill)}`),
                ...match.teachStudent.map((skill) => `Teach ${escapeHtml(skill)}`)
            ];
            const explanation = match.learnFromStudent.length && match.teachStudent.length
                ? `They can teach ${match.learnFromStudent.map(escapeHtml).join(", ")}, which you want to learn, and they want to learn ${match.teachStudent.map(escapeHtml).join(", ")}, which you can teach.`
                : match.learnFromStudent.length
                    ? `They can teach ${match.learnFromStudent.map(escapeHtml).join(", ")}, which you want to learn.`
                    : `They want to learn ${match.teachStudent.map(escapeHtml).join(", ")}, which you can teach.`;

            return `
                <article class="match-card" data-student-id="${escapeHtml(match.student.id)}">
                    <div class="match-card-top">
                        <span class="match-rank">${String(index + 1).padStart(2, "0")}</span>
                        <span class="match-score">${match.percentage}% <small>match</small></span>
                    </div>
                    <div class="student-card-heading">
                        <span class="student-avatar ${escapeHtml(match.student.avatar)}" aria-hidden="true">${escapeHtml(match.student.initials)}</span>
                        <div class="student-heading-copy">
                            <h3>${escapeHtml(match.student.name)}</h3>
                            <span class="student-meta">${escapeHtml(match.student.major)}</span>
                        </div>
                    </div>
                    <p class="student-label">Skills in common</p>
                    <div class="student-skill-list">${matchingSkills.map((skill) => `<span class="student-skill">${skill}</span>`).join("")}</div>
                    <p class="match-explanation">${explanation}</p>
                    <div class="student-card-actions">
                        <button type="button" data-action="profile">View Profile</button>
                        <button class="request-swap" type="button" data-action="request">Request Swap</button>
                    </div>
                </article>
            `;
        }).join("");

        matchResults.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    closeMatchesButton?.addEventListener("click", () => {
        if (matchResults instanceof HTMLElement) {
            matchResults.hidden = true;
        }
    });

    const handleStudentCardAction = (event) => {
        if (!(event.target instanceof Element)) {
            return;
        }
        const actionButton = event.target.closest("button[data-action]");
        const card = actionButton?.closest("[data-student-id]");
        const student = directoryStudents.find((item) => item.id === card?.getAttribute("data-student-id"));
        if (!actionButton || !student) {
            return;
        }

        if (actionButton.dataset.action === "request") {
            if (directoryNotice) {
                try {
                    sendSkillSwapRequest(student);
                    directoryNotice.textContent = "Swap request sent! We'll let you know when the student responds.";
                } catch (error) {
                    console.error("Unable to send the skill swap request.", error);
                    directoryNotice.textContent = error instanceof Error ? error.message : "We couldn’t save your swap request.";
                }
            }
            return;
        }

        if (actionButton.dataset.action === "profile" && profileDialog instanceof HTMLDialogElement && profileContent) {
            profileContent.innerHTML = `
                <div class="student-card-heading">
                    <span class="student-avatar ${escapeHtml(student.avatar)}" aria-hidden="true">${escapeHtml(student.initials)}</span>
                    <div class="student-heading-copy">
                        <h2 id="profile-name">${escapeHtml(student.name)}</h2>
                        <span class="student-meta"><i class="student-online"></i>Campus student</span>
                    </div>
                </div>
                <p class="profile-bio">${escapeHtml(student.bio)}</p>
                <p class="student-label">Course &amp; year</p>
                <p class="profile-detail">${escapeHtml(student.major)}</p>
                <p class="student-label">Can teach</p>
                <div class="student-skill-list">${student.teaches.map((skill) => `<span class="student-skill">${escapeHtml(skill)}</span>`).join("")}</div>
                <p class="student-label">Wants to learn</p>
                <div class="student-skill-list">${student.learns.map((skill) => `<span class="student-skill wants">${escapeHtml(skill)}</span>`).join("")}</div>
                <p class="student-label">Interests</p>
                <div class="student-skill-list">${student.interests.map((interest) => `<span class="student-skill interest">${escapeHtml(interest)}</span>`).join("")}</div>
                <p class="student-meta">Usually free: ${escapeHtml(student.availability || "Connect to arrange a time")}</p>
                <button class="button button-primary profile-request" type="button" data-student-id="${escapeHtml(student.id)}">Request Skill Swap <span aria-hidden="true">↗</span></button>
                <p class="swap-confirmation" role="status" aria-live="polite" hidden></p>
            `;
            profileDialog.showModal();
        }
    };
    studentGrid.addEventListener("click", handleStudentCardAction);
    matchGrid?.addEventListener("click", handleStudentCardAction);

    profileDialog?.querySelector(".dialog-close")?.addEventListener("click", () => {
        profileDialog.close();
    });

    profileDialog?.addEventListener("click", (event) => {
        if (!(event.target instanceof Element)) {
            return;
        }
        const requestButton = event.target.closest(".profile-request");
        if (requestButton) {
            const confirmation = profileDialog.querySelector(".swap-confirmation");
            if (confirmation) {
                const requestedStudent = directoryStudents.find((student) => student.id === requestButton.getAttribute("data-student-id"));
                try {
                    if (!requestedStudent) {
                        throw new Error("This student profile is no longer available.");
                    }
                    sendSkillSwapRequest(requestedStudent);
                    confirmation.textContent = "Swap request sent! We'll let you know when the student responds.";
                    requestButton.setAttribute("disabled", "");
                } catch (error) {
                    console.error("Unable to send the skill swap request.", error);
                    confirmation.textContent = error instanceof Error ? error.message : "We couldn’t save your swap request.";
                }
                confirmation.hidden = false;
            }
        }
    });

    renderSkills();
}

const dashboardStudentName = document.querySelector("#dashboard-student-name");
const dashboardTeaches = document.querySelector("#dashboard-teaches");
const dashboardLearns = document.querySelector("#dashboard-learns");
const dashboardMatches = document.querySelector("#dashboard-matches");
const dashboardProfile = document.querySelector("#dashboard-profile");
const dashboardAlert = document.querySelector("#dashboard-alert");
const sentRequestsElement = document.querySelector("#sent-requests");
const receivedRequestsElement = document.querySelector("#received-requests");

if (dashboardStudentName && dashboardTeaches && dashboardLearns && dashboardMatches && dashboardProfile) {
    try {
        const savedProfiles = readSavedProfiles();
        const currentProfile = getCurrentProfile(savedProfiles);

        if (!currentProfile) {
            dashboardStudentName.textContent = "student";
            dashboardAlert.innerHTML = `Create your profile to personalize your dashboard. <a href="share-skill.html">Create a profile ↗</a>`;
            dashboardTeaches.innerHTML = `<span class="dashboard-empty">Add skills you can teach to your profile.</span>`;
            dashboardLearns.innerHTML = `<span class="dashboard-empty">Add skills you want to learn to your profile.</span>`;
            dashboardMatches.innerHTML = `<p class="dashboard-empty">Your best matches will appear after you create your profile.</p>`;
            dashboardProfile.innerHTML = `<p class="dashboard-empty">No profile saved yet.</p><a class="button button-primary" href="share-skill.html">Create My Profile <span aria-hidden="true">↗</span></a>`;
        } else {
            const candidates = [...students, ...savedProfiles];
            const matches = findComplementaryMatches(currentProfile, candidates);
            dashboardStudentName.textContent = currentProfile.name.split(" ")[0];
            dashboardAlert.textContent = "";
            dashboardTeaches.innerHTML = currentProfile.teaches.map((skill) => `<span class="student-skill">${escapeHtml(skill)}</span>`).join("");
            dashboardLearns.innerHTML = currentProfile.learns.map((skill) => `<span class="student-skill wants">${escapeHtml(skill)}</span>`).join("");
            dashboardMatches.innerHTML = matches.length
                ? matches.map((match, index) => {
                    const complementarySkills = [
                        ...match.learnFromStudent.map((skill) => `They teach ${escapeHtml(skill)}`),
                        ...match.teachStudent.map((skill) => `You teach ${escapeHtml(skill)}`)
                    ];
                    return `
                        <article class="dashboard-match">
                            <span class="match-rank">${String(index + 1).padStart(2, "0")}</span>
                            <div class="dashboard-match-copy">
                                <h3>${escapeHtml(match.student.name)}</h3>
                                <p>${escapeHtml(match.student.major)}</p>
                                <div class="student-skill-list">${complementarySkills.map((skill) => `<span class="student-skill">${skill}</span>`).join("")}</div>
                            </div>
                            <span class="dashboard-match-score">${match.percentage}%<small>match</small></span>
                        </article>
                    `;
                }).join("")
                : `<p class="dashboard-empty">No skill matches yet. Add more skills to your profile or check back later.</p>`;

            dashboardProfile.innerHTML = `
                <div class="dashboard-profile-identity">
                    <span class="student-avatar ${escapeHtml(currentProfile.avatar)}" aria-hidden="true">${escapeHtml(currentProfile.initials)}</span>
                    <div><h3>${escapeHtml(currentProfile.name)}</h3><p>${escapeHtml(currentProfile.major)}</p></div>
                </div>
                <p class="dashboard-profile-bio">${escapeHtml(currentProfile.bio)}</p>
                <p class="student-label">Interests</p>
                <div class="student-skill-list">${currentProfile.interests.map((interest) => `<span class="student-skill interest">${escapeHtml(interest)}</span>`).join("")}</div>
                <a class="button button-secondary edit-profile-button" href="share-skill.html?edit=1">Edit Profile <span aria-hidden="true">↗</span></a>
            `;
        }

        if (sentRequestsElement && receivedRequestsElement) {
            const requestValue = localStorage.getItem(swapRequestStorageKey);
            const requests = requestValue ? JSON.parse(requestValue) : [];
            if (!Array.isArray(requests)) {
                throw new Error("Saved swap requests are not in the expected format.");
            }
            const validRequests = requests.filter((request) =>
                request
                && typeof request.senderId === "string"
                && typeof request.senderName === "string"
                && typeof request.recipientId === "string"
                && typeof request.recipientName === "string"
                && typeof request.status === "string"
            );

            if (!currentProfile) {
                sentRequestsElement.innerHTML = `<p class="dashboard-empty">Create a profile before sending a request.</p>`;
                receivedRequestsElement.innerHTML = `<p class="dashboard-empty">Received requests will appear here.</p>`;
            } else {
                const sentRequests = validRequests.filter((request) => request.senderId === currentProfile.id);
                const receivedRequests = validRequests.filter((request) => request.recipientId === currentProfile.id);
                const renderRequest = (request, otherStudent, label) => `
                    <article class="request-item">
                        <span class="request-status">${escapeHtml(request.status)}</span>
                        <div><strong>${escapeHtml(label)} ${escapeHtml(otherStudent)}</strong><small>${request.createdAt ? new Date(request.createdAt).toLocaleDateString() : "Recently"}</small></div>
                    </article>
                `;
                sentRequestsElement.innerHTML = sentRequests.length
                    ? sentRequests.map((request) => renderRequest(request, request.recipientName, "To")).join("")
                    : `<p class="dashboard-empty">You haven’t sent any swap requests yet.</p>`;
                receivedRequestsElement.innerHTML = receivedRequests.length
                    ? receivedRequests.map((request) => renderRequest(request, request.senderName, "From")).join("")
                    : `<p class="dashboard-empty">No incoming requests yet.</p>`;
            }
        }
    } catch (error) {
        console.error("Unable to load dashboard data from localStorage.", error);
        dashboardAlert.textContent = "Some saved dashboard data couldn’t be loaded from this browser.";
    }
}