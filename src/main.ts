import "./styles.css";
import { pb } from "./pocketbase";

const AUTH_COLLECTION = import.meta.env.VITE_AUTH_COLLECTION ?? "users";
const ARTWORK_COLLECTION = import.meta.env.VITE_ARTWORK_COLLECTION ?? "artworks";
const ORDERS_COLLECTION = import.meta.env.VITE_ORDERS_COLLECTION ?? "orders";

const SIZE_MULTIPLIERS = {
  Small: 1,
  Medium: 1.35,
  Large: 1.75,
} as const;

type ArtSize = keyof typeof SIZE_MULTIPLIERS;

interface Artwork {
  id: string;
  title: string;
  imageUrl: string;
  description: string;
  basePrice: number;
}

interface CartItem {
  artId: string;
  title: string;
  size: ArtSize;
  unitPrice: number;
}

interface ArtworkRecord {
  id: string;
  title: string;
  imageUrl?: string;
  imageFile?: string;
  description?: string;
  basePrice: number;
}

interface AuthRecord {
  id: string;
  email?: string;
  isAdmin?: boolean;
}

interface AppElements {
  form: HTMLFormElement;
  catalog: HTMLDivElement;
  openCartBtn: HTMLButtonElement;
  closeCartBtn: HTMLButtonElement;
  cartDialog: HTMLDialogElement;
  successDialog: HTMLDialogElement;
  closeSuccessBtn: HTMLButtonElement;
  cartItems: HTMLDivElement;
  cartTotal: HTMLElement;
  cartCount: HTMLElement;
  checkoutForm: HTMLFormElement;
  orderMessage: HTMLParagraphElement;
  adminLoginForm: HTMLFormElement;
  adminSignInBtn: HTMLButtonElement;
  adminEmail: HTMLInputElement;
  adminPassword: HTMLInputElement;
  imageUrl: HTMLInputElement;
  imageFile: HTMLInputElement;
  imageBrowseBtn: HTMLButtonElement;
  imageDropZone: HTMLDivElement;
  imageFileName: HTMLParagraphElement;
  adminStatus: HTMLParagraphElement;
  adminOnlyArea: HTMLDivElement;
  adminNotice: HTMLParagraphElement;
  adminLogoutBtn: HTMLButtonElement;
}

function getEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing required element: #${id}`);
  }
  return el as T;
}

const elements: AppElements = {
  form: getEl<HTMLFormElement>("art-form"),
  catalog: getEl<HTMLDivElement>("catalog"),
  openCartBtn: getEl<HTMLButtonElement>("open-cart-btn"),
  closeCartBtn: getEl<HTMLButtonElement>("close-cart-btn"),
  cartDialog: getEl<HTMLDialogElement>("cart-dialog"),
  successDialog: getEl<HTMLDialogElement>("success-dialog"),
  closeSuccessBtn: getEl<HTMLButtonElement>("close-success-btn"),
  cartItems: getEl<HTMLDivElement>("cart-items"),
  cartTotal: getEl<HTMLElement>("cart-total"),
  cartCount: getEl<HTMLElement>("cart-count"),
  checkoutForm: getEl<HTMLFormElement>("checkout-form"),
  orderMessage: getEl<HTMLParagraphElement>("order-message"),
  adminLoginForm: getEl<HTMLFormElement>("admin-login-form"),
  adminSignInBtn: getEl<HTMLButtonElement>("admin-sign-in-btn"),
  adminEmail: getEl<HTMLInputElement>("admin-email"),
  adminPassword: getEl<HTMLInputElement>("admin-password"),
  imageUrl: getEl<HTMLInputElement>("imageUrl"),
  imageFile: getEl<HTMLInputElement>("imageFile"),
  imageBrowseBtn: getEl<HTMLButtonElement>("image-browse-btn"),
  imageDropZone: getEl<HTMLDivElement>("image-drop-zone"),
  imageFileName: getEl<HTMLParagraphElement>("image-file-name"),
  adminStatus: getEl<HTMLParagraphElement>("admin-status"),
  adminOnlyArea: getEl<HTMLDivElement>("admin-only-area"),
  adminNotice: getEl<HTMLParagraphElement>("admin-notice"),
  adminLogoutBtn: getEl<HTMLButtonElement>("admin-logout-btn"),
};

let artworks: Artwork[] = [];
let cart: CartItem[] = [];
let selectedImageFile: File | null = null;

boot().catch((error) => {
  console.error(error);
  alert(`Startup failed: ${error instanceof Error ? error.message : "Unknown error"}`);
});

async function boot(): Promise<void> {
  bindEvents();
  renderCart();
  updateAdminUi();

  await refreshArtworks();

  pb.authStore.onChange(() => {
    updateAdminUi();
  }, true);
}

function bindEvents(): void {
  elements.imageBrowseBtn.addEventListener("click", () => {
    if (elements.imageBrowseBtn.disabled) {
      return;
    }
    elements.imageFile.click();
  });

  elements.imageFile.addEventListener("change", () => {
    const file = elements.imageFile.files?.[0] ?? null;
    setSelectedImageFile(file);
  });

  elements.imageDropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (!elements.imageFile.disabled) {
      elements.imageDropZone.classList.add("dragover");
    }
  });

  elements.imageDropZone.addEventListener("dragleave", () => {
    elements.imageDropZone.classList.remove("dragover");
  });

  elements.imageDropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    elements.imageDropZone.classList.remove("dragover");

    if (elements.imageFile.disabled) {
      return;
    }

    const file = event.dataTransfer?.files?.[0] ?? null;
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      alert("Please drop an image file.");
      return;
    }

    setSelectedImageFile(file);
  });

  elements.adminLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (isCurrentUserAdmin()) {
      alert("You are already signed in as admin. Sign out first to switch accounts.");
      return;
    }

    const email = elements.adminEmail.value.trim();
    const password = elements.adminPassword.value;

    if (!email || !password) {
      alert("Enter admin email and password.");
      return;
    }

    try {
      await pb.collection(AUTH_COLLECTION).authWithPassword(email, password);
      elements.adminPassword.value = "";

      if (!isCurrentUserAdmin()) {
        pb.authStore.clear();
        updateAdminUi();
        alert("This account is not an admin.");
        return;
      }

      await refreshArtworks();
    } catch (error) {
      console.error(error);
      alert(
        `Admin sign-in failed for collection "${AUTH_COLLECTION}": ${readPocketBaseError(
          error
        )}. Use a "${AUTH_COLLECTION}" auth user with isAdmin=true (not System _superusers).`
      );
    }
  });

  elements.adminLogoutBtn.addEventListener("click", () => {
    pb.authStore.clear();
    updateAdminUi();
  });

  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!isCurrentUserAdmin()) {
      alert("Only authenticated admins can create artwork.");
      return;
    }

    const title = getEl<HTMLInputElement>("title").value.trim();
    const imageUrl = elements.imageUrl.value.trim();
    const basePrice = Number(getEl<HTMLInputElement>("basePrice").value);
    const description = getEl<HTMLTextAreaElement>("description").value.trim();

    if (!imageUrl && !selectedImageFile) {
      alert("Add an image URL or drag and drop an image file.");
      return;
    }

    const artworkData: {
      title: string;
      imageUrl?: string;
      imageFile?: File;
      description: string;
      basePrice: number;
    } = {
      title,
      description,
      basePrice,
    };

    if (imageUrl) {
      artworkData.imageUrl = imageUrl;
    }

    if (selectedImageFile) {
      artworkData.imageFile = selectedImageFile;
    }

    try {
      await pb.collection(ARTWORK_COLLECTION).create(artworkData);

      await refreshArtworks();
      elements.form.reset();
      setSelectedImageFile(null);
    } catch (error) {
      console.error(error);
      alert(
        `Could not save artwork to "${ARTWORK_COLLECTION}": ${readPocketBaseError(error)}`
      );
    }
  });

  elements.openCartBtn.addEventListener("click", () => elements.cartDialog.showModal());
  elements.closeCartBtn.addEventListener("click", () => elements.cartDialog.close());
  elements.closeSuccessBtn.addEventListener("click", () => elements.successDialog.close());

  elements.checkoutForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!cart.length) {
      alert("Your cart is empty.");
      return;
    }

    const buyerName = getEl<HTMLInputElement>("buyerName").value.trim();
    const buyerEmail = getEl<HTMLInputElement>("buyerEmail").value.trim();
    const shippingAddress = getEl<HTMLTextAreaElement>("shippingAddress").value.trim();
    const total = calculateTotal();

    try {
      const orderRecord = await pb.collection(ORDERS_COLLECTION).create({
        buyerName,
        buyerEmail,
        shippingAddress,
        items: cart,
        total,
      });

      elements.orderMessage.textContent = `Order ${orderRecord.id} saved for ${buyerName}. Total: ${formatMoney(total)}.`;

      cart = [];
      elements.checkoutForm.reset();
      renderCart();
      elements.cartDialog.close();
      elements.successDialog.showModal();
    } catch (error) {
      console.error(error);
      alert("Could not submit order. Check PocketBase order create rules.");
    }
  });
}

function readPocketBaseError(error: unknown): string {
  if (error && typeof error === "object") {
    const maybeError = error as {
      message?: string;
      response?: { message?: string; data?: Record<string, { message?: string }> };
    };

    const fieldErrors = maybeError.response?.data
      ? Object.values(maybeError.response.data)
          .map((entry) => entry?.message)
          .filter((msg): msg is string => Boolean(msg))
      : [];

    if (fieldErrors.length > 0) {
      return fieldErrors.join("; ");
    }

    if (maybeError.response?.message) {
      return maybeError.response.message;
    }

    if (maybeError.message) {
      return maybeError.message;
    }
  }

  return "Unknown authentication error";
}

function isCurrentUserAdmin(): boolean {
  if (!pb.authStore.isValid) {
    return false;
  }

  const record = pb.authStore.record as AuthRecord | null;
  return record?.isAdmin === true;
}

function updateAdminUi(): void {
  const isSignedIn = pb.authStore.isValid;
  const isAdmin = isCurrentUserAdmin();
  const record = pb.authStore.record as AuthRecord | null;

  if (isAdmin) {
    const identity = record?.email ?? record?.id ?? "admin";
    elements.adminStatus.textContent = `Signed in as admin: ${identity}`;
  } else if (isSignedIn) {
    elements.adminStatus.textContent = "Signed in, but this account does not have admin access.";
  } else {
    elements.adminStatus.textContent = "Not signed in.";
  }

  elements.adminLogoutBtn.hidden = !isSignedIn;
  elements.adminOnlyArea.classList.toggle("locked", !isAdmin);
  elements.adminNotice.hidden = isAdmin;
  elements.adminEmail.disabled = isAdmin;
  elements.adminPassword.disabled = isAdmin;
  elements.adminSignInBtn.disabled = isAdmin;
  elements.imageDropZone.classList.toggle("locked", !isAdmin);

  for (const field of Array.from(elements.form.elements)) {
    if (field instanceof HTMLButtonElement || field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
      field.disabled = !isAdmin;
    }
  }
}

async function loadArtworks(): Promise<Artwork[]> {
  const records = await pb.collection(ARTWORK_COLLECTION).getFullList<ArtworkRecord>({
    sort: "-createdAt",
  });

  return records.map((record) => ({
    id: record.id,
    title: record.title,
    imageUrl: resolveArtworkImage(record),
    description: record.description ?? "Original artwork",
    basePrice: record.basePrice,
  }));
}

function resolveArtworkImage(record: ArtworkRecord): string {
  if (record.imageFile) {
    return pb.files.getURL(record as unknown as { [key: string]: unknown }, record.imageFile);
  }

  return record.imageUrl ?? "";
}

function setSelectedImageFile(file: File | null): void {
  selectedImageFile = file;

  if (!file) {
    elements.imageFile.value = "";
    elements.imageFileName.textContent = "No image file selected.";
    return;
  }

  elements.imageFileName.textContent = `Selected file: ${file.name}`;
}

async function refreshArtworks(): Promise<void> {
  try {
    artworks = await loadArtworks();
    renderCatalog();
  } catch (error) {
    console.error(error);
    elements.catalog.innerHTML =
      '<p class="cart-item-meta">Could not load artwork list. Check PocketBase and collection read rules.</p>';
  }
}

function renderCatalog(): void {
  elements.catalog.innerHTML = "";

  artworks.forEach((art) => {
    const card = document.createElement("article");
    card.className = "art-card";

    const sizeOptions = (Object.keys(SIZE_MULTIPLIERS) as ArtSize[])
      .map((size) => `<option value="${size}">${size}</option>`)
      .join("");

    card.innerHTML = `
      <img class="art-image" src="${escapeHtml(art.imageUrl)}" alt="${escapeHtml(art.title)}" loading="lazy" />
      <div class="art-body">
        <h3>${escapeHtml(art.title)}</h3>
        <p>${escapeHtml(art.description || "Original artwork")}</p>
        <div class="size-row">
          <label for="size-${art.id}">Size</label>
          <select id="size-${art.id}">
            ${sizeOptions}
          </select>
        </div>
        <div class="price-row">
          <span class="price" id="price-${art.id}">${formatMoney(art.basePrice)}</span>
          <button class="btn" type="button" data-add-id="${art.id}">Add to Cart</button>
        </div>
      </div>
    `;

    const sizeSelect = card.querySelector(`#size-${CSS.escape(art.id)}`) as HTMLSelectElement | null;
    const priceTag = card.querySelector(`#price-${CSS.escape(art.id)}`) as HTMLElement | null;
    const addButton = card.querySelector("[data-add-id]") as HTMLButtonElement | null;

    if (!sizeSelect || !priceTag || !addButton) {
      return;
    }

    sizeSelect.addEventListener("change", () => {
      const size = sizeSelect.value as ArtSize;
      priceTag.textContent = formatMoney(sizePrice(art.basePrice, size));
    });

    addButton.addEventListener("click", () => {
      const size = sizeSelect.value as ArtSize;
      cart.push({
        artId: art.id,
        title: art.title,
        size,
        unitPrice: sizePrice(art.basePrice, size),
      });
      renderCart();
    });

    elements.catalog.appendChild(card);
  });
}

function renderCart(): void {
  elements.cartItems.innerHTML = "";

  if (!cart.length) {
    elements.cartItems.innerHTML = '<p class="cart-item-meta">No items yet.</p>';
  }

  const grouped = new Map<
    string,
    { item: CartItem; quantity: number; firstIndex: number }
  >();

  cart.forEach((item, index) => {
    const key = `${item.artId}__${item.size}__${item.unitPrice}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += 1;
      return;
    }
    grouped.set(key, { item, quantity: 1, firstIndex: index });
  });

  Array.from(grouped.values()).forEach((group) => {
    const row = document.createElement("div");
    row.className = "cart-item";
    const lineTotal = group.item.unitPrice * group.quantity;

    row.innerHTML = `
      <span class="cart-item-title">${group.quantity}x ${escapeHtml(group.item.title)}</span>
      <strong>${formatMoney(lineTotal)}</strong>
      <span class="cart-item-meta">${group.item.size}</span>
      <button class="text-btn" type="button" data-remove-index="${group.firstIndex}">Remove</button>
    `;

    const removeButton = row.querySelector("[data-remove-index]") as HTMLButtonElement | null;
    if (removeButton) {
      removeButton.addEventListener("click", () => {
        cart.splice(group.firstIndex, 1);
        renderCart();
      });
    }

    elements.cartItems.appendChild(row);
  });

  elements.cartTotal.textContent = formatMoney(calculateTotal());
  elements.cartCount.textContent = String(cart.length);
}

function sizePrice(basePrice: number, size: ArtSize): number {
  return Math.round(basePrice * SIZE_MULTIPLIERS[size] * 100) / 100;
}

function calculateTotal(): number {
  return cart.reduce((sum, item) => sum + item.unitPrice, 0);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
