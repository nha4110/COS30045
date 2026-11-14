export function initializeInterface({ onLayoutChange }) {
    const labels = document.getElementById("point-label-toggle");
    labels?.addEventListener("change", () => {
        document.body.classList.toggle("show-point-labels", labels.checked);
        onLayoutChange();
    });

    document.getElementById("reset-filters")?.addEventListener("click", () => {
        if (labels) labels.checked = false;
        document.body.classList.remove("show-point-labels");
    });

    document.querySelectorAll(".additional-trends").forEach((details) => {
        details.addEventListener("toggle", () => {
            if (details.open) onLayoutChange();
        });
    });

    const links = [...document.querySelectorAll('.header-nav a[href^="#"]')];
    const targets = links.map(link => document.querySelector(link.hash)).filter(Boolean);
    let scheduled = false;
    const updateNavigation = () => {
        scheduled = false;
        let active = null;
        targets.forEach(target => {
            if (target.getBoundingClientRect().top <= 180) active = target;
        });
        links.forEach(link => {
            if (active && link.hash === `#${active.id}`) link.setAttribute("aria-current", "location");
            else link.removeAttribute("aria-current");
        });
    };
    window.addEventListener("scroll", () => {
        if (!scheduled) {
            scheduled = true;
            window.requestAnimationFrame(updateNavigation);
        }
    }, { passive: true });
    updateNavigation();
}

export function updateViewContext() {
    const label = (id, fallback) => {
        const select = document.getElementById(id);
        return select?.selectedOptions?.[0]?.textContent?.trim() || fallback;
    };
    const target = document.getElementById("view-context");
    if (target) {
        target.textContent = `Focus: ${label("user-filter", "all road users")} · Comparison: ${label("year-filter", "latest year")} · Age & sex: ${label("demographic-year-filter", "all years combined")}`;
    }
}
