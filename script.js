const API =
  window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost"
    ? window.location.origin
    : "https://toto-dental.onrender.com";

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

const availabilityLabels = {
  available: "Завтай",
  limited: "Цөөн сул цагтай",
  busy: "Өнөөдөр завгүй"
};

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
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

  if (
    !doctorSelect ||
    !doctorPicker ||
    !branchPicker ||
    !branchSelect ||
    !selectedDoctor ||
    !slotCalendar ||
    !patientForm ||
    !formResponse
  ) {
    return;
  }

  const data = await requestJson(`${API}/api/public/booking`);
  const doctors = data.doctors || [];
  const requestedDoctor = doctors.find((doctor) => doctor.id === requestedDoctorId);
  let activeBranch = requestedDoctor?.branch || doctors[0]?.branch || "Салбар 1";
  let activeDoctorId =
    requestedDoctor?.id ||
    doctors.find((doctor) => doctor.branch === activeBranch)?.id ||
    doctors[0]?.id ||
    "";

  const getFilteredDoctors = () => doctors.filter((doctor) => doctor.branch === activeBranch);

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
    const filteredDoctors = getFilteredDoctors();
    const doctor = filteredDoctors.find((item) => item.id === activeDoctorId) || filteredDoctors[0];
    if (!doctor) return;

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
                .map(
                  (time) => `
                    <button
                      class="slot-btn ${doctor.availability}"
                      type="button"
                      data-doctor="${doctor.id}"
                      data-date="${slot.date}"
                      data-time="${time}"
                      ${doctor.availability === "busy" ? "disabled" : ""}
                    >
                      ${time}
                    </button>
                  `
                )
                .join("")}
            </div>
          </article>
        `
      )
      .join("");
  };

  renderOptions();
  renderDoctors();
  renderScheduler();

  branchPicker.addEventListener("change", (event) => {
    activeBranch = event.target.value;
    renderOptions();
    renderDoctors();
    renderScheduler();
  });

  branchSelect.addEventListener("change", (event) => {
    activeBranch = event.target.value;
    branchPicker.value = activeBranch;
    renderOptions();
    renderDoctors();
    renderScheduler();
  });

  doctorPicker.addEventListener("change", (event) => {
    activeDoctorId = event.target.value;
    doctorSelect.value = activeDoctorId;
    renderScheduler();
  });

  doctorSelect.addEventListener("change", (event) => {
    activeDoctorId = event.target.value;
    doctorPicker.value = activeDoctorId;
    renderScheduler();
  });

  slotCalendar.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.classList.contains("slot-btn")) return;

    activeDoctorId = target.dataset.doctor || activeDoctorId;
    const selectedDoctorData = doctors.find((doctor) => doctor.id === activeDoctorId);
    if (selectedDoctorData) {
      activeBranch = selectedDoctorData.branch;
      branchPicker.value = activeBranch;
      branchSelect.value = activeBranch;
    }

    doctorSelect.value = activeDoctorId;
    doctorPicker.value = activeDoctorId;
    patientForm.querySelector('input[name="date"]').value = target.dataset.date || "";
    patientForm.querySelector('input[name="time"]').value = target.dataset.time || "";
    renderDoctors();
    renderScheduler();
    formResponse.hidden = false;
    formResponse.textContent = `Сонгосон цаг: ${target.dataset.date} ${target.dataset.time}. Одоо нэр, утсаа оруулаад хүсэлтээ илгээнэ үү.`;
  });

  patientForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(patientForm);

    try {
      await requestJson(`${API}/api/public/requests`, {
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
      branchPicker.value = activeBranch;
      branchSelect.value = activeBranch;
      doctorSelect.value = activeDoctorId;
      doctorPicker.value = activeDoctorId;
      formResponse.hidden = false;
      formResponse.textContent = "Цагийн хүсэлт амжилттай илгээгдлээ. Reception шалгаад баталгаажуулна.";
    } catch (error) {
      formResponse.hidden = false;
      formResponse.textContent = error.message;
    }
  });
}

initBooking().catch((error) => {
  const formResponse = document.querySelector("#form-response");
  if (formResponse) {
    formResponse.hidden = false;
    formResponse.textContent = error.message;
  }
});
