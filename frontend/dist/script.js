const API_BASE = (window.__APP_CONFIG__?.API_BASE || "/api").replace(/\/+$/, "");

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.16 }
);

document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));

function initNavHighlight() {
  const navLinks = Array.from(document.querySelectorAll(".nav a"));
  if (!navLinks.length) return;

  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";

  const normalizeHref = (href) => {
    const url = new URL(href, window.location.origin);
    return {
      path: url.pathname.replace(/\/+$/, "") || "/",
      hash: url.hash || ""
    };
  };

  const setActive = (predicate) => {
    navLinks.forEach((link) => {
      link.classList.toggle("is-active", predicate(link));
    });
  };

  if (pathname === "/booking") {
    setActive((link) => normalizeHref(link.href).path === "/booking");
    return;
  }

  if (pathname === "/doctors") {
    setActive((link) => normalizeHref(link.href).path === "/doctors");
    return;
  }

  const sections = ["services", "feature", "team", "contact"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  if (!sections.length) {
    setActive((link) => normalizeHref(link.href).path === "/" && !normalizeHref(link.href).hash);
    return;
  }

  const updateActiveSection = () => {
    const marker = window.scrollY + 160;
    let currentSection = "";

    sections.forEach((section) => {
      if (marker >= section.offsetTop) {
        currentSection = section.id;
      }
    });

    if (!currentSection) {
      setActive((link) => normalizeHref(link.href).path === "/" && !normalizeHref(link.href).hash);
      return;
    }

    setActive((link) => normalizeHref(link.href).hash === `#${currentSection}`);
  };

  updateActiveSection();
  window.addEventListener("scroll", updateActiveSection, { passive: true });
}

const availabilityLabels = {
  available: "Завтай",
  limited: "Цөөн сул цагтай",
  busy: "Өнөөдөр завгүй"
};

function showMessage(container, message) {
  if (!container) return;
  container.hidden = false;
  container.textContent = message;
}

function clearMessage(container) {
  if (!container) return;
  container.hidden = true;
  container.textContent = "";
}

async function requestJson(url, options = {}) {
  const finalUrl = url.startsWith("http") ? url : `${API_BASE}${url}`;

  const response = await fetch(finalUrl, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  if (!response.ok) {
    let message = "Хүсэлт амжилтгүй боллоо";
    try {
      const errorBody = await response.json();
      message = errorBody.error || message;
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }

  return response.status === 204 ? null : response.json();
}

async function initBooking() {
  const params = new URLSearchParams(window.location.search);
  const requestedDoctorId = params.get("doctor") || "";
  const doctorGrid = document.querySelector("#doctor-grid");
  const doctorSelect = document.querySelector("#doctor-select");
  const doctorPicker = document.querySelector("#doctor-picker");
  const branchPicker = document.querySelector("#branch-picker");
  const branchSelect = document.querySelector("#branch-select");
  const selectedDoctor = document.querySelector("#selected-doctor");
  const slotCalendar = document.querySelector("#slot-calendar");
  const patientForm = document.querySelector("#patient-form");
  const formResponse = document.querySelector("#form-response");
  const submitButton = patientForm?.querySelector('button[type="submit"]');
  const timeDisplay = document.querySelector("#time-display");
  const bookingPanel = document.querySelector(".booking-panel");
  const successModal = document.querySelector("#success-modal");
  const successModalClose = document.querySelector("#success-modal-close");

  if (
    !doctorSelect ||
    !doctorPicker ||
    !branchPicker ||
    !branchSelect ||
    !selectedDoctor ||
    !slotCalendar ||
    !patientForm ||
    !formResponse ||
    !timeDisplay
  ) {
    return;
  }

  let doctors = [];
  let activeBranch = "Салбар 1";
  let activeDoctorId = "";
  let selectedSlotKey = "";

  const getSelectedSlotKey = (date, time) => `${date}|${time}`;
  const getFilteredDoctors = () => doctors.filter((doctor) => doctor.branch === activeBranch);
  const getDoctorById = (doctorId) => doctors.find((doctor) => doctor.id === doctorId);
  const getCurrentDoctor = () => {
    const filteredDoctors = getFilteredDoctors();
    return filteredDoctors.find((doctor) => doctor.id === activeDoctorId) || filteredDoctors[0] || null;
  };

  const clearSelectedTime = () => {
    patientForm.querySelector('input[name="date"]').value = "";
    patientForm.querySelector('input[name="time"]').value = "";
    timeDisplay.value = "";
    selectedSlotKey = "";
  };

  const showSuccessModal = () => {
    if (!successModal) return;
    successModal.hidden = false;
    successModalClose?.focus();
  };

  const hideSuccessModal = () => {
    if (!successModal) return;
    successModal.hidden = true;
  };

  const isSelectedSlotAvailable = () => {
    const selectedDate = patientForm.querySelector('input[name="date"]').value;
    const selectedTime = patientForm.querySelector('input[name="time"]').value;

    if (!selectedDate || !selectedTime) return true;

    const doctor = getDoctorById(activeDoctorId);
    if (!doctor || doctor.availability === "busy") return false;

    return doctor.slots.some((slot) =>
      slot.date === selectedDate &&
      slot.times.some((time) => time.value === selectedTime && !time.isBooked)
    );
  };

  const syncFormAvailability = (doctor) => {
    const isBusy = doctor?.availability === "busy";
    const dateInput = patientForm.querySelector('input[name="date"]');
    const timeInput = patientForm.querySelector('input[name="time"]');

    dateInput.disabled = isBusy;
    timeInput.disabled = isBusy;
    timeDisplay.disabled = isBusy;
    if (submitButton) {
      submitButton.disabled = isBusy;
    }

    if (isBusy) {
      clearSelectedTime();
      showMessage(formResponse, "Reception энэ эмчийг өнөөдөр завгүй гэж тэмдэглэсэн тул онлайн хүсэлт түр хаагдсан байна.");
      return;
    }

    if (formResponse.textContent.includes("онлайн хүсэлт түр хаагдсан")) {
      clearMessage(formResponse);
    }
  };

  const renderOptions = () => {
    const filteredDoctors = getFilteredDoctors();
    if (!filteredDoctors.some((doctor) => doctor.id === activeDoctorId)) {
      activeDoctorId = filteredDoctors[0]?.id || "";
    }

    const options = filteredDoctors
      .map((doctor) => `<option value="${doctor.id}">${doctor.name}</option>`)
      .join("");

    doctorSelect.innerHTML = options;
    doctorPicker.innerHTML = options;
    doctorSelect.value = activeDoctorId;
    doctorPicker.value = activeDoctorId;
    branchPicker.value = activeBranch;
    branchSelect.value = activeBranch;
  };

  const renderDoctors = () => {
    if (!doctorGrid) return;

    doctorGrid.innerHTML = getFilteredDoctors()
      .map(
        (doctor) => `
          <article class="doctor-status-card doctor-${doctor.availability}">
            <div class="doctor-top">
              <span class="doctor-branch">${doctor.branch}</span>
              <span class="doctor-status">${availabilityLabels[doctor.availability]}</span>
            </div>
            <h3>${doctor.name}</h3>
            <p class="doctor-role">${doctor.role}</p>
            <ul class="doctor-meta">
              <li><strong>Хуваарь:</strong> ${doctor.hours}</li>
              <li><strong>Тэмдэглэл:</strong> ${doctor.note}</li>
            </ul>
          </article>
        `
      )
      .join("");
  };

  const renderScheduler = () => {
    const doctor = getCurrentDoctor();
    if (!doctor) {
      selectedDoctor.innerHTML = "";
      slotCalendar.innerHTML = "";
      return;
    }

    selectedDoctor.innerHTML = `
      <article class="selected-card selected-${doctor.availability}">
        <div>
          <p class="panel-kicker">Сонгогдсон эмч</p>
          <h4>${doctor.name}</h4>
          <p>${doctor.role}</p>
        </div>
        <div class="selected-meta">
          <span>${doctor.branch}</span>
          <span>${availabilityLabels[doctor.availability]}</span>
          <span>${doctor.hours}</span>
        </div>
      </article>
    `;

    if (doctor.availability === "busy") {
      syncFormAvailability(doctor);
      slotCalendar.innerHTML = `
        <article class="slot-day">
          <div class="slot-head">
            <strong>${doctor.name}</strong>
            <span>${availabilityLabels[doctor.availability]}</span>
          </div>
          <div class="slot-times">
            <span class="slot-empty">Reception энэ эмчийг өнөөдөр завгүй гэж тэмдэглэсэн тул цаг сонгохгүй.</span>
          </div>
        </article>
      `;
      return;
    }

    syncFormAvailability(doctor);

    slotCalendar.innerHTML = doctor.slots
      .map(
        (slot) => `
          <article class="slot-day">
            <div class="slot-head">
              <strong>${slot.label}</strong>
              <span>${slot.date}</span>
            </div>
            <div class="slot-times">
              ${slot.times
                .map((time) => {
                  const slotKey = getSelectedSlotKey(slot.date, time.value);
                  const classes = ["slot-btn", time.state];
                  if (selectedSlotKey === slotKey && !time.isBooked) {
                    classes.push("is-selected");
                  }

                  return `
                    <button
                      class="${classes.join(" ")}"
                      type="button"
                      data-doctor="${doctor.id}"
                      data-date="${slot.date}"
                      data-time="${time.value}"
                      ${time.isBooked ? "disabled" : ""}
                      title="${time.isBooked ? "Энэ цаг аль хэдийн захиалагдсан." : "Энэ цагийг сонгоно."}"
                    >
                      ${time.value}${time.isBooked ? " · Захиалагдсан" : ""}
                    </button>
                  `;
                })
                .join("")}
            </div>
          </article>
        `
      )
      .join("");
  };

  const syncSelectionFeedback = () => {
    const doctor = getCurrentDoctor();
    if (!doctor || doctor.availability === "busy") {
      clearSelectedTime();
      return;
    }

    if (isSelectedSlotAvailable()) return;

    clearSelectedTime();
    renderScheduler();
    showMessage(formResponse, "Сонгосон цаг энэ хооронд захиалагдсан эсвэл эмчийн төлөв өөрчлөгдсөн тул өөр цаг сонгоно уу.");
  };

  const renderAll = () => {
    renderOptions();
    renderDoctors();
    renderScheduler();
    syncSelectionFeedback();
  };

  const refreshBookingData = async ({ preserveAutoMessage = true } = {}) => {
    const data = await requestJson("/public/booking");
    const nextDoctors = data.doctors || [];
    const requestedDoctor = nextDoctors.find((doctor) => doctor.id === requestedDoctorId);

    doctors = nextDoctors;
    activeBranch =
      nextDoctors.find((doctor) => doctor.id === activeDoctorId)?.branch ||
      requestedDoctor?.branch ||
      nextDoctors[0]?.branch ||
      activeBranch ||
      "Салбар 1";
    activeDoctorId =
      nextDoctors.find((doctor) => doctor.id === activeDoctorId)?.id ||
      requestedDoctor?.id ||
      nextDoctors.find((doctor) => doctor.branch === activeBranch)?.id ||
      nextDoctors[0]?.id ||
      "";

    renderAll();

    if (!preserveAutoMessage && formResponse.textContent.includes("Сонгосон цаг")) {
      clearMessage(formResponse);
    }
  };

  await refreshBookingData();

  branchPicker.addEventListener("change", (event) => {
    activeBranch = event.target.value;
    renderAll();
  });

  branchSelect.addEventListener("change", (event) => {
    activeBranch = event.target.value;
    branchPicker.value = activeBranch;
    renderAll();
  });

  doctorPicker.addEventListener("change", (event) => {
    activeDoctorId = event.target.value;
    doctorSelect.value = activeDoctorId;
    renderScheduler();
    syncSelectionFeedback();
  });

  doctorSelect.addEventListener("change", (event) => {
    activeDoctorId = event.target.value;
    doctorPicker.value = activeDoctorId;
    renderScheduler();
    syncSelectionFeedback();
  });

  slotCalendar.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.classList.contains("slot-btn") || target.hasAttribute("disabled")) {
      return;
    }

    activeDoctorId = target.dataset.doctor || activeDoctorId;
    const selectedDoctorData = getDoctorById(activeDoctorId);
    if (selectedDoctorData) {
      activeBranch = selectedDoctorData.branch;
      branchPicker.value = activeBranch;
      branchSelect.value = activeBranch;
    }

    doctorSelect.value = activeDoctorId;
    doctorPicker.value = activeDoctorId;
    patientForm.querySelector('input[name="date"]').value = target.dataset.date || "";
    patientForm.querySelector('input[name="time"]').value = target.dataset.time || "";
    timeDisplay.value = target.dataset.time || "";
    selectedSlotKey = getSelectedSlotKey(target.dataset.date || "", target.dataset.time || "");
    renderDoctors();
    renderScheduler();
    showMessage(formResponse, `Сонгосон цаг: ${target.dataset.date} ${target.dataset.time}. Одоо нэр, утсаа оруулаад хүсэлтээ илгээнэ үү.`);
    patientForm.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  patientForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(patientForm);
    const selectedDoctorData = getDoctorById(formData.get("doctorId"));

    try {
      bookingPanel?.classList.add("is-submitting");

      if (selectedDoctorData?.availability === "busy") {
        throw new Error("Сонгосон эмч өнөөдөр завгүй байна. Өөр эмч эсвэл өөр өдөр сонгоно уу.");
      }

      await requestJson("/public/requests", {
        method: "POST",
        body: JSON.stringify({
          patientName: formData.get("patientName"),
          phone: formData.get("phone"),
          doctorId: formData.get("doctorId"),
          branch: formData.get("branch"),
          date: formData.get("date"),
          time: formData.get("time"),
          notes: formData.get("notes")
        })
      });

      patientForm.reset();
      selectedSlotKey = "";
      branchPicker.value = activeBranch;
      branchSelect.value = activeBranch;
      doctorSelect.value = activeDoctorId;
      doctorPicker.value = activeDoctorId;
      clearMessage(formResponse);
      await refreshBookingData({ preserveAutoMessage: false });
      showSuccessModal();
    } catch (error) {
      showMessage(formResponse, error.message);
    } finally {
      bookingPanel?.classList.remove("is-submitting");
    }
  });

  successModalClose?.addEventListener("click", hideSuccessModal);
  successModal?.addEventListener("click", (event) => {
    if (event.target === successModal) {
      hideSuccessModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideSuccessModal();
    }
  });

  const triggerRefresh = async () => {
    try {
      await refreshBookingData();
    } catch (error) {
      showMessage(formResponse, error.message);
    }
  };

  window.setInterval(triggerRefresh, 15000);
  window.addEventListener("focus", triggerRefresh);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      triggerRefresh();
    }
  });
}

initBooking().catch((error) => {
  const formResponse = document.querySelector("#form-response");
  if (formResponse) {
    showMessage(formResponse, error.message);
  }
});

initNavHighlight();
