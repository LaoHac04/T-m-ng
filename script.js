// Tọa độ trung tâm thành phố Nha Trang
const NHA_TRANG = [12.2388, 109.1967];

const map = L.map("map").setView(NHA_TRANG, 13);
L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
  {
    attribution: "Tiles &copy; Esri",
    maxZoom: 19,
  },
).addTo(map);

const startInput = document.getElementById("start");
const endInput = document.getElementById("end");
const statusEl = document.getElementById("status");
const routeInfo = document.getElementById("routeInfo");
const routeBtn = document.getElementById("routeBtn");

let startPoint = null;
let endPoint = null;
let startMarker = null;
let endMarker = null;
let routeLayer = null;
let pickMode = null;

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

function setPoint(which, latlng, label) {
  const isStart = which === "start";
  const markerColor = isStart ? "#16a36a" : "#e05252";
  const marker = L.circleMarker(latlng, {
    radius: 9,
    color: "#fff",
    weight: 3,
    fillColor: markerColor,
    fillOpacity: 1,
  }).addTo(map);

  if (isStart) {
    if (startMarker) map.removeLayer(startMarker);
    startPoint = latlng;
    startMarker = marker.bindPopup("Điểm xuất phát");
    startInput.value =
      label || `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
  } else {
    if (endMarker) map.removeLayer(endMarker);
    endPoint = latlng;
    endMarker = marker.bindPopup("Điểm đến");
    endInput.value =
      label || `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
  }
  clearRoute();
}

function clearRoute() {
  if (routeLayer) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }
  routeInfo.classList.add("hidden");
}

document
  .getElementById("pickStart")
  .addEventListener("click", () => activatePick("start"));
document
  .getElementById("pickEnd")
  .addEventListener("click", () => activatePick("end"));

function activatePick(which) {
  pickMode = which;
  document
    .getElementById("pickStart")
    .classList.toggle("active", which === "start");
  document
    .getElementById("pickEnd")
    .classList.toggle("active", which === "end");
  setStatus(
    `Đang chọn ${which === "start" ? "điểm xuất phát" : "điểm đến"}: hãy nhấn vào vị trí trên bản đồ.`,
  );
}

map.on("click", (event) => {
  if (!pickMode) return;
  setPoint(pickMode, event.latlng);
  pickMode = null;
  document
    .querySelectorAll(".pick-btn")
    .forEach((button) => button.classList.remove("active"));
  setStatus(
    "Đã chọn vị trí. Bạn có thể chọn điểm còn lại hoặc nhấn Tìm đường.",
    "success",
  );
});

// Tìm tọa độ từ địa chỉ bằng dịch vụ Nominatim (OpenStreetMap)
async function geocode(address) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({
    q: `${address}, Nha Trang, Khánh Hòa, Việt Nam`,
    format: "jsonv2",
    limit: "1",
    countrycodes: "vn",
  });
  const response = await fetch(url, { headers: { "Accept-Language": "vi" } });
  if (!response.ok) throw new Error("Không thể kết nối dịch vụ tìm địa chỉ.");
  const results = await response.json();
  if (!results.length) throw new Error(`Không tìm thấy địa điểm: ${address}`);
  return {
    lat: Number(results[0].lat),
    lng: Number(results[0].lon),
    label: results[0].display_name.split(",").slice(0, 3).join(","),
  };
}

async function resolvePoint(which) {
  const input = which === "start" ? startInput : endInput;
  const existing = which === "start" ? startPoint : endPoint;
  if (existing && input.value.trim()) return existing;
  if (!input.value.trim())
    throw new Error(
      `Vui lòng nhập ${which === "start" ? "điểm xuất phát" : "điểm đến"}.`,
    );

  const found = await geocode(input.value.trim());
  const latlng = L.latLng(found.lat, found.lng);
  setPoint(which, latlng, found.label);
  return latlng;
}

function formatDistance(meters) {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(2)} km`
    : `${Math.round(meters)} m`;
}

function formatDuration(seconds) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  return `${hours} giờ ${minutes % 60} phút`;
}

// OSRM trả về các phương án tuyến đường; chọn phương án có tổng quãng đường nhỏ nhất.
async function findShortestRoute(start, end) {
  const coordinates = `${start.lng},${start.lat};${end.lng},${end.lat}`;
  const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&alternatives=3&steps=false`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Dịch vụ định tuyến hiện không phản hồi.");
  const data = await response.json();
  if (data.code !== "Ok" || !data.routes?.length) {
    throw new Error("Không tìm được tuyến đường phù hợp giữa hai địa điểm.");
  }
  return data.routes.reduce((shortest, route) =>
    route.distance < shortest.distance ? route : shortest,
  );
}

routeBtn.addEventListener("click", async () => {
  routeBtn.disabled = true;
  routeBtn.textContent = "Đang tìm...";
  setStatus("Đang xác định địa điểm và tính toán tuyến đường...");
  clearRoute();

  try {
    const start = await resolvePoint("start");
    const end = await resolvePoint("end");
    const route = await findShortestRoute(start, end);

    routeLayer = L.geoJSON(route.geometry, {
      style: { color: "#087e9d", weight: 6, opacity: 0.88 },
    }).addTo(map);

    const bounds = routeLayer.getBounds();
    map.fitBounds(bounds, { padding: [45, 45] });

    document.getElementById("distance").textContent = formatDistance(
      route.distance,
    );
    document.getElementById("duration").textContent = formatDuration(
      route.duration,
    );
    document.getElementById("routeNote").textContent =
      "Đã chọn tuyến có quãng đường ngắn nhất trong các phương án mà OSRM trả về.";
    routeInfo.classList.remove("hidden");
    setStatus(
      "Đã tìm thấy tuyến đường. Tuyến đi được hiển thị màu xanh trên bản đồ.",
      "success",
    );
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    routeBtn.disabled = false;
    routeBtn.textContent = "Tìm đường";
  }
});

// Lấy vị trí hiện tại của người dùng (trình duyệt sẽ hỏi quyền truy cập).
document.getElementById("locateBtn").addEventListener("click", () => {
  if (!navigator.geolocation) {
    setStatus("Trình duyệt không hỗ trợ xác định vị trí.", "error");
    return;
  }
  setStatus("Đang lấy vị trí hiện tại...");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const point = L.latLng(
        position.coords.latitude,
        position.coords.longitude,
      );
      setPoint("start", point, "Vị trí hiện tại");
      map.setView(point, 16);
      startMarker.openPopup();
      setStatus("Đã đặt vị trí hiện tại làm điểm xuất phát.", "success");
    },
    (error) => {
      const message =
        error.code === 1
          ? "Bạn chưa cấp quyền truy cập vị trí."
          : "Không thể xác định vị trí. Hãy thử nhập địa chỉ hoặc chọn trên bản đồ.";
      setStatus(message, "error");
    },
    { enableHighAccuracy: true, timeout: 10000 },
  );
});
