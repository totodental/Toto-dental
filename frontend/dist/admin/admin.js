const API_BASE = (window.__APP_CONFIG__?.API_BASE || "/api").replace(/\/+$/, "");

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const availabilityLabels = {
  available: "Завтай",
  limited: "Цөөн сул цагтай",
  busy: "Өнөөдөр завгүй"
};

async function requestJson(url, options = {}) {
  const finalUrl = url.startsWith("http") ? url : `${API_BASE}${url}`;

  const response = await fetch(finalUrl, {
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
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

async function initAdmin() {
  const params = new URLSearchParams(window.location.search);
  const routeId = params.get("id") || "";

  const loginPanel = document.querySelector("#login-panel");
  const deniedPanel = document.querySelector("#denied-panel");
  const workspace = document.querySelector("#admin-workspace");
  const loginForm = document.querySelector("#admin-login-form");
  const usernameInput = document.querySelector("#admin-username");
  const passwordInput = document.querySelector("#admin-password");
  const loginFeedback = document.querySelector("#login-feedback");
  const logoutBtn = document.querySelector("#admin-logout");
  const requestList = document.querySelector("#request-list");
  const statusControls = document.querySelector("#status-controls");
  const pendingCount = document.querySelector("#pending-count");
  const confirmedCount = document.querySelector("#confirmed-count");
  const busyCount = document.querySelector("#busy-count");
  const clearRequests = document.querySelector("#clear-requests");
  const createAppointmentBtn = document.querySelector("#admin-create-appointment");
  const calendarTitle = document.querySelector("#calendar-title");
  const calendarGrid = document.querySelector("#calendar-grid");
  const dayDetailTitle = document.querySelector("#day-detail-title");
  const dayDetailList = document.querySelector("#day-detail-list");
  const calendarPrev = document.querySelector("#calendar-prev");
  const calendarToday = document.querySelector("#calendar-today");
  const calendarNext = document.querySelector("#calendar-next");
  const editorForm = document.querySelector("#appointment-editor-form");
  const editorFeedback = document.querySelector("#editor-feedback");
  const editorReset = document.querySelector("#editor-reset");
  const editorConfirm = document.querySelector("#editor-confirm");
  const editorDelete = document.querySelector("#editor-delete");
  const editorAppointmentId = document.querySelector("#editor-appointment-id");
  const editorPatientName = document.querySelector("#editor-patient-name");
  const editorPhone = document.querySelector("#editor-phone");
  const editorDoctor = document.querySelector("#editor-doctor");
  const editorBranch = document.querySelector("#editor-branch");
  const editorDate = document.querySelector("#editor-date");
  const editorTime = document.querySelector("#editor-time");
  const editorStatus = document.querySelector("#editor-status");
  const editorNotes = document.querySelector("#editor-notes");

  let doctors = [];
  let requests = [];
  let activeMonth = new Date();
  let selectedAppointmentId = "";
  let selectedDay = "";
  activeMonth = new Date(activeMonth.getFullYear(), activeMonth.getMonth(), 1);

  loginPanel.hidden = true;
  deniedPanel.hidden = true;
  workspace.hidden = true;

  const getStatusLabel = (status) => {
    if (status === "confirmed") return "Баталгаажсан";
    if (status === "cancelled") return "Цуцалсан";
    if (status === "completed") return "Дууссан";
    if (status === "archived") return "Түүхэнд хадгалсан";
    return "Хүлээгдэж буй";
  };

  const renderDayDetails = (date) => {
    selectedDay = date || "";
    if (!date) {
      dayDetailTitle.textContent = "Өдөр сонгоогүй байна";
      dayDetailList.innerHTML = '<div class="empty-box">Календарь дээрх өдөр эсвэл `+N өөр` дээр дарж тухайн өдрийн бүх захиалгыг харна.</div>';
      return;
    }

    const dayAppointments = requests
      .filter((item) => item.date === date)
      .sort((a, b) => a.time.localeCompare(b.time));

    dayDetailTitle.textContent = `${date} өдрийн захиалгууд`;

    dayDetailList.innerHTML = dayAppointments.length
      ? dayAppointments
          .map((item) => {
            const doctor = doctors.find((doctorItem) => doctorItem.id === item.doctorId);
            return `
              <article class="day-detail-item ${item.status} ${item.id === selectedAppointmentId ? "is-selected" : ""}" data-appointment-id="${item.id}">
                <div class="day-detail-primary">
                  <strong>${item.time}</strong>
                  <span>${doctor ? doctor.name : item.doctorId}</span>
                </div>
                <div class="day-detail-secondary">
                  <strong>${item.patientName}</strong>
                  <span>${item.phone}</span>
                </div>
                <span class="request-badge">${getStatusLabel(item.status)}</span>
              </article>
            `;
          })
          .join("")
      : '<div class="empty-box">Энэ өдөр захиалга алга.</div>';
  };

  const getDoctorsByBranch = (branch) => doctors.filter((item) => item.branch === branch);

  const renderEditorDoctors = (preferredDoctorId = "") => {
    const selectedBranch = editorBranch.value || doctors[0]?.branch || "Салбар 1";
    const branchDoctors = getDoctorsByBranch(selectedBranch);

    editorDoctor.innerHTML = branchDoctors
      .map((doctor) => `<option value="${doctor.id}">${doctor.name}</option>`)
      .join("");

    if (preferredDoctorId && branchDoctors.some((doctor) => doctor.id === preferredDoctorId)) {
      editorDoctor.value = preferredDoctorId;
      return;
    }

    editorDoctor.value = branchDoctors[0]?.id || "";
  };

  const syncEditorBranchFromDoctor = () => {
    const doctor = doctors.find((item) => item.id === editorDoctor.value);
    if (!doctor) return;

    if (editorBranch.value !== doctor.branch) {
      editorBranch.value = doctor.branch;
      renderEditorDoctors(doctor.id);
      return;
    }

    editorBranch.value = doctor.branch;
  };

  const resetEditor = (dateValue = "", statusValue = "pending") => {
    selectedAppointmentId = "";
    editorAppointmentId.value = "";
    editorPatientName.value = "";
    editorPhone.value = "";
    editorBranch.value = doctors[0]?.branch || "Салбар 1";
    renderEditorDoctors();
    editorDate.value = dateValue;
    editorTime.value = "";
    editorStatus.value = statusValue;
    editorNotes.value = "";
    editorFeedback.textContent = "Шинэ цаг үүсгэх эсвэл календарь дээрх event дээр дарж засварлана.";
  };

  const loadEditor = (appointment) => {
    selectedAppointmentId = appointment.id;
    editorAppointmentId.value = appointment.id;
    editorPatientName.value = appointment.patientName || "";
    editorPhone.value = appointment.phone || "";
    const doctor = doctors.find((item) => item.id === appointment.doctorId);
    editorBranch.value = appointment.branch || doctor?.branch || doctors[0]?.branch || "Салбар 1";
    renderEditorDoctors(appointment.doctorId || "");
    editorDate.value = appointment.date || "";
    editorTime.value = appointment.time || "";
    editorStatus.value = appointment.status || "pending";
    editorNotes.value = appointment.notes || "";
    editorFeedback.textContent = `${appointment.patientName} · ${appointment.date} ${appointment.time} захиалгыг засварлаж байна.`;
  };

  const getEditorPayload = () => ({
    patientName: editorPatientName.value.trim(),
    phone: editorPhone.value.trim(),
    doctorId: editorDoctor.value,
    branch: editorBranch.value,
    date: editorDate.value,
    time: editorTime.value,
    status: editorStatus.value,
    notes: editorNotes.value.trim()
  });

  const renderDoctorOptions = () => {
    const selectedAppointment = requests.find((item) => item.id === selectedAppointmentId);
    if (selectedAppointment) {
      const selectedDoctor = doctors.find((doctor) => doctor.id === selectedAppointment.doctorId);
      editorBranch.value = selectedAppointment.branch || selectedDoctor?.branch || doctors[0]?.branch || "Салбар 1";
      renderEditorDoctors(selectedAppointment.doctorId);
    } else {
      editorBranch.value = editorBranch.value || doctors[0]?.branch || "Салбар 1";
      renderEditorDoctors();
    }
  };

  const renderRequests = () => {
    const sortedRequests = [...requests].sort((a, b) => {
      const createdDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (createdDiff !== 0) return createdDiff;
      return b.id.localeCompare(a.id);
    });

    const pending = requests.filter((request) => request.status === "pending");
    const confirmed = requests.filter((request) => request.status === "confirmed");
    const busy = doctors.filter((doctor) => doctor.availability === "busy");

    pendingCount.textContent = pending.length;
    confirmedCount.textContent = confirmed.length;
    busyCount.textContent = busy.length;

    requestList.innerHTML = sortedRequests.length
      ? sortedRequests
          .map((request) => {
            const doctor = doctors.find((item) => item.id === request.doctorId);
            const selectedClass = request.id === selectedAppointmentId ? "is-selected" : "";
            return `
              <article class="request-card request-${request.status} ${selectedClass}">
                <div class="queue-head">
                  <div>
                    <strong>${request.patientName}</strong>
                    <p>${doctor ? doctor.name : request.doctorId} · ${request.branch}</p>
                  </div>
                  <span class="request-badge">${getStatusLabel(request.status)}</span>
                </div>
                <div class="request-meta">
                  <span>${request.date} · ${request.time}</span>
                  <span>${request.phone}</span>
                </div>
                <p>${request.notes || "Нэмэлт тайлбаргүй"}</p>
                <div class="request-actions">
                  <button class="ghost-btn" type="button" data-action="confirm" data-id="${request.id}">Батлах</button>
                  <button class="ghost-btn" type="button" data-action="edit" data-id="${request.id}">Өөрчлөх</button>
                  <button class="ghost-btn" type="button" data-action="reject" data-id="${request.id}">Цуцлах</button>
                  <button class="ghost-btn" type="button" data-action="delete" data-id="${request.id}">Түүхлэх</button>
                </div>
              </article>
            `;
          })
          .join("")
      : `<div class="empty-box">Одоогоор ирсэн цагийн хүсэлт алга.</div>`;
  };

  const renderStatusControls = () => {
    statusControls.innerHTML = doctors
      .map(
        (doctor) => `
          <article class="status-card">
            <strong>${doctor.name}</strong>
            <span class="status-summary status-${doctor.availability}">${availabilityLabels[doctor.availability]}</span>
            <div class="status-buttons">
              <button class="ghost-btn ${doctor.availability === "available" ? "is-active active-available" : ""}" type="button" data-status="available" data-doctor="${doctor.id}">Завтай</button>
              <button class="ghost-btn ${doctor.availability === "limited" ? "is-active active-limited" : ""}" type="button" data-status="limited" data-doctor="${doctor.id}">Хязгаартай</button>
              <button class="ghost-btn ${doctor.availability === "busy" ? "is-active active-busy" : ""}" type="button" data-status="busy" data-doctor="${doctor.id}">Завгүй</button>
            </div>
          </article>
        `
      )
      .join("");
  };

  const renderCalendar = () => {
    const year = activeMonth.getFullYear();
    const month = activeMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDay = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const today = new Date();

    calendarTitle.textContent = `${activeMonth.toLocaleString("mn-MN", { month: "long" })} ${year}`;

    const cells = [];
    for (let i = 0; i < startDay; i += 1) {
      cells.push({ date: new Date(year, month - 1, daysInPrevMonth - startDay + i + 1), isOtherMonth: true });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({ date: new Date(year, month, day), isOtherMonth: false });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ date: new Date(year, month + 1, cells.length - (startDay + daysInMonth) + 1), isOtherMonth: true });
    }

    calendarGrid.innerHTML = cells
      .map(({ date, isOtherMonth }) => {
        const iso = formatLocalDate(date);
        const dayRequests = requests
          .filter((request) => request.date === iso)
          .sort((a, b) => a.time.localeCompare(b.time));
        const visibleRequests = dayRequests.slice(0, 2);
        const hiddenCount = Math.max(dayRequests.length - visibleRequests.length, 0);
        const isToday =
          date.getFullYear() === today.getFullYear() &&
          date.getMonth() === today.getMonth() &&
          date.getDate() === today.getDate();

        return `
          <div class="calendar-day ${isOtherMonth ? "is-other-month" : ""} ${isToday ? "is-today" : ""}" data-date="${iso}">
            <div class="calendar-date">
              <strong>${date.getDate()}</strong>
              <span>${dayRequests.length ? `${dayRequests.length} зах.` : ""}</span>
            </div>
            <div class="calendar-events">
              ${
                dayRequests.length
                  ? `
                    ${visibleRequests
                      .map((request) => {
                        const doctor = doctors.find((item) => item.id === request.doctorId);
                        return `
                          <article
                            class="calendar-event ${request.status} ${request.id === selectedAppointmentId ? "is-selected" : ""}"
                            data-appointment-id="${request.id}"
                            draggable="true"
                            title="Чирээд өөр өдөр рүү зөөнө"
                          >
                            <strong>${request.time} · ${doctor ? doctor.name : request.doctorId}</strong>
                            <span>${request.patientName}</span>
                          </article>
                        `;
                      })
                      .join("")}
                    ${
                      hiddenCount
                        ? `<button class="calendar-more" type="button" data-date="${iso}">+${hiddenCount} өөр</button>`
                        : ""
                    }
                  `
                  : '<span class="slot-empty">Захиалга алга</span>'
              }
            </div>
          </div>
        `;
      })
      .join("");
  };

  const renderDashboard = () => {
    renderRequests();
    renderStatusControls();
    renderCalendar();
    renderDayDetails(selectedDay);
  };

  const loadDashboard = async () => {
    const data = await requestJson("/admin/dashboard");
    doctors = data.doctors || [];
    requests = data.requests || [];
    renderDoctorOptions();
    renderDashboard();
  };

  const session = await requestJson(`/admin/session?id=${encodeURIComponent(routeId)}`);
  if (!session.routeValid) {
    deniedPanel.hidden = false;
    return;
  }

  if (!session.authenticated) {
    loginPanel.hidden = false;
    workspace.hidden = true;
  } else {
    loginPanel.hidden = true;
    workspace.hidden = false;
    await loadDashboard();
    resetEditor();
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await requestJson("/admin/login", {
        method: "POST",
        body: JSON.stringify({
          routeId,
          username: usernameInput.value.trim(),
          password: passwordInput.value
        })
      });
      loginFeedback.textContent = "";
      loginPanel.hidden = true;
      workspace.hidden = false;
      await loadDashboard();
      resetEditor();
    } catch (error) {
      loginPanel.hidden = false;
      workspace.hidden = true;
      loginFeedback.textContent = error.message;
    }
  });

  logoutBtn.addEventListener("click", async () => {
    await requestJson("/admin/logout", { method: "POST" });
    window.location.reload();
  });

  editorBranch.addEventListener("change", () => {
    renderEditorDoctors();
  });

  editorDoctor.addEventListener("change", syncEditorBranchFromDoctor);

  editorForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const payload = getEditorPayload();
      if (selectedAppointmentId) {
        await requestJson(`/admin/appointments/${selectedAppointmentId}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
        editorFeedback.textContent = "Захиалгын өөрчлөлт хадгалагдлаа.";
      } else {
        const response = await requestJson("/admin/appointments", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        selectedAppointmentId = response.appointment?.id || "";
        editorAppointmentId.value = selectedAppointmentId;
        editorFeedback.textContent = "Шинэ цаг амжилттай үүслээ.";
      }
      await loadDashboard();
    } catch (error) {
      editorFeedback.textContent = error.message;
    }
  });

  editorConfirm.addEventListener("click", async () => {
    const payload = getEditorPayload();
    payload.status = "confirmed";
    editorStatus.value = "confirmed";

    try {
      if (selectedAppointmentId) {
        await requestJson(`/admin/appointments/${selectedAppointmentId}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
      } else {
        const response = await requestJson("/admin/appointments", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        selectedAppointmentId = response.appointment?.id || "";
        editorAppointmentId.value = selectedAppointmentId;
      }
      editorFeedback.textContent = "Цаг confirmed боллоо.";
      await loadDashboard();
    } catch (error) {
      editorFeedback.textContent = error.message;
    }
  });

  editorDelete.addEventListener("click", async () => {
    if (!selectedAppointmentId) {
      editorFeedback.textContent = "Түүхлэх захиалга сонгогдоогүй байна.";
      return;
    }

    try {
      await requestJson(`/admin/appointments/${selectedAppointmentId}`, { method: "DELETE" });
      await loadDashboard();
      resetEditor(editorDate.value);
      editorFeedback.textContent = "Захиалга түүхэнд хадгалагдлаа.";
    } catch (error) {
      editorFeedback.textContent = error.message;
    }
  });

  editorReset.addEventListener("click", () => {
    resetEditor(editorDate.value);
  });

  requestList.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset.action;
    const requestId = target.dataset.id;
    if (!action || !requestId) return;

    const current = requests.find((item) => item.id === requestId);
    if (!current) return;

    try {
      if (action === "delete") {
        await requestJson(`/admin/requests/${requestId}`, { method: "DELETE" });
        if (selectedAppointmentId === requestId) {
          resetEditor(editorDate.value);
        }
      } else if (action === "edit") {
        loadEditor(current);
      } else {
        const status = action === "confirm" ? "confirmed" : "cancelled";
        await requestJson(`/admin/appointments/${requestId}`, {
          method: "PATCH",
          body: JSON.stringify({ status })
        });
        if (selectedAppointmentId === requestId) {
          editorStatus.value = status;
        }
      }
      await loadDashboard();
    } catch (error) {
      editorFeedback.textContent = error.message;
    }
  });

  statusControls.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const doctorId = target.dataset.doctor;
    const status = target.dataset.status;
    if (!doctorId || !status) return;

    try {
      await requestJson(`/admin/doctors/${doctorId}`, {
        method: "PATCH",
        body: JSON.stringify({ availability: status })
      });
      await loadDashboard();
    } catch (error) {
      editorFeedback.textContent = error.message;
    }
  });

  clearRequests.addEventListener("click", async () => {
    const confirmed = window.confirm("Та итгэлтэй байна уу? Бүх хүсэлтүүд түүхэнд хадгалагдаж, идэвхтэй жагсаалтаас гарна.");
    if (!confirmed) return;

    try {
      await requestJson("/admin/requests", { method: "DELETE" });
      await loadDashboard();
      resetEditor(editorDate.value);
      editorFeedback.textContent = "Хүсэлтүүд түүхэнд хадгалагдлаа.";
    } catch (error) {
      editorFeedback.textContent = error.message;
    }
  });

  createAppointmentBtn.addEventListener("click", () => {
    resetEditor(formatLocalDate(new Date()));
  });

  calendarGrid.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const eventCard = target.closest(".calendar-event");
    if (eventCard) {
      const appointmentId = eventCard.dataset.appointmentId;
      const appointment = requests.find((item) => item.id === appointmentId);
      if (appointment) {
        loadEditor(appointment);
        renderDashboard();
      }
      return;
    }

    const day = target.closest(".calendar-day");
    if (day) {
      const selectedDate = day.dataset.date || "";
      resetEditor(selectedDate);
      renderDayDetails(selectedDate);
      editorFeedback.textContent = `${selectedDate} өдрийн захиалгуудыг доорх "Өдрийн дэлгэрэнгүй" хэсгээс харна.`;
    }
  });

  dayDetailList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const item = target.closest(".day-detail-item");
    if (!item) return;
    const appointmentId = item.dataset.appointmentId;
    const appointment = requests.find((request) => request.id === appointmentId);
    if (!appointment) return;
    loadEditor(appointment);
    renderDashboard();
  });

  calendarGrid.addEventListener("dragstart", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const eventCard = target.closest(".calendar-event");
    if (!eventCard) return;

    event.dataTransfer?.setData("text/plain", eventCard.dataset.appointmentId || "");
    event.dataTransfer.effectAllowed = "move";
  });

  calendarGrid.addEventListener("dragover", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const day = target.closest(".calendar-day");
    if (!day) return;
    event.preventDefault();
    day.classList.add("is-drop-target");
  });

  calendarGrid.addEventListener("dragleave", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const day = target.closest(".calendar-day");
    if (day) {
      day.classList.remove("is-drop-target");
    }
  });

  calendarGrid.addEventListener("drop", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const day = target.closest(".calendar-day");
    if (!day) return;
    event.preventDefault();
    day.classList.remove("is-drop-target");

    const appointmentId = event.dataTransfer?.getData("text/plain");
    if (!appointmentId) return;
    const appointment = requests.find((item) => item.id === appointmentId);
    if (!appointment) return;

    try {
      const updated = await requestJson(`/admin/appointments/${appointmentId}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...appointment,
          date: day.dataset.date
        })
      });
      loadEditor(updated.appointment);
      editorFeedback.textContent = "Календарь дээрээс өдөр нь амжилттай өөрчлөгдлөө.";
      await loadDashboard();
    } catch (error) {
      editorFeedback.textContent = error.message;
    }
  });

  calendarPrev.addEventListener("click", () => {
    activeMonth = new Date(activeMonth.getFullYear(), activeMonth.getMonth() - 1, 1);
    renderCalendar();
  });

  calendarToday.addEventListener("click", () => {
    const now = new Date();
    activeMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    renderCalendar();
  });

  calendarNext.addEventListener("click", () => {
    activeMonth = new Date(activeMonth.getFullYear(), activeMonth.getMonth() + 1, 1);
    renderCalendar();
  });
}

initAdmin().catch((error) => {
  const loginPanel = document.querySelector("#login-panel");
  const deniedPanel = document.querySelector("#denied-panel");
  const workspace = document.querySelector("#admin-workspace");
  const loginFeedback = document.querySelector("#login-feedback");

  if (deniedPanel) deniedPanel.hidden = true;
  if (workspace) workspace.hidden = true;
  if (loginPanel) loginPanel.hidden = false;
  if (loginFeedback) {
    loginFeedback.textContent = error.message || "Admin panel ачаалахад алдаа гарлаа.";
  }
});
