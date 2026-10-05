/* ==========================================================================
   Appliance Energy Consumption Website - Main Script
   Handles FAQ Accordion, Dynamic Footer Year, and Calculator
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

    // 1. Footer Year
    const yearSpan = document.getElementById('current-year');
    if (yearSpan) {
        yearSpan.textContent = new Date().getFullYear();
    }

    // 2. FAQ Accordion Logic (index.html)
    const accordionHeaders = document.querySelectorAll('.accordion-header');

    accordionHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const item = header.parentElement;
            const isExpanded = header.getAttribute('aria-expanded') === 'true';

            // Close other items
            document.querySelectorAll('.accordion-item').forEach(otherItem => {
                if (otherItem !== item) {
                    otherItem.classList.remove('active');
                    const otherHeader = otherItem.querySelector('.accordion-header');
                    if (otherHeader) otherHeader.setAttribute('aria-expanded', 'false');
                    const otherContent = otherItem.querySelector('.accordion-content');
                    if (otherContent) otherContent.style.maxHeight = null;
                }
            });

            // Toggle current item
            if (isExpanded) {
                header.setAttribute('aria-expanded', 'false');
                item.classList.remove('active');
                item.querySelector('.accordion-content').style.maxHeight = null;
            } else {
                header.setAttribute('aria-expanded', 'true');
                item.classList.add('active');
                const content = item.querySelector('.accordion-content');
                content.style.maxHeight = content.scrollHeight + 'px';
            }
        });
    });

    // 3. Calculator Logic (televisions.html)
    const calcForm = document.getElementById('energy-calculator');
    const presetSelect = document.getElementById('appliance-preset');
    const wattsInput = document.getElementById('appliance-watts');
    const hoursInput = document.getElementById('daily-hours');
    const rateInput = document.getElementById('electricity-rate');
    const resultsPanel = document.getElementById('calculator-results');

    // Handle Preset Selection
    if (presetSelect && wattsInput) {
        presetSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            if (val !== 'custom') {
                wattsInput.value = val;
                clearError('watts-error');
            }
        });
    }

    // Handle Form Submit
    if (calcForm) {
        calcForm.addEventListener('submit', (e) => {
            e.preventDefault();

            clearAllErrors();

            const watts = parseFloat(wattsInput.value);
            const hours = parseFloat(hoursInput.value);
            const rate = parseFloat(rateInput.value);

            let isValid = true;

            if (isNaN(watts) || watts <= 0) {
                showError('watts-error', 'Please enter a valid power rating (> 0 Watts).');
                isValid = false;
            }

            if (isNaN(hours) || hours <= 0 || hours > 24) {
                showError('hours-error', 'Please enter hours between 0.1 and 24.');
                isValid = false;
            }

            if (isNaN(rate) || rate <= 0) {
                showError('rate-error', 'Please enter a valid electricity rate (cents/kWh).');
                isValid = false;
            }

            if (!isValid) return;

            // Calculations
            const dailyKwh = (watts * hours) / 1000;
            const monthlyKwh = dailyKwh * 30.5;
            const yearlyKwh = dailyKwh * 365;

            const rateInDollars = rate / 100;
            const yearlyCost = yearlyKwh * rateInDollars;

            // Update DOM Output
            document.getElementById('res-daily-kwh').textContent = `${dailyKwh.toFixed(2)} kWh`;
            document.getElementById('res-monthly-kwh').textContent = `${monthlyKwh.toFixed(2)} kWh`;
            document.getElementById('res-yearly-kwh').textContent = `${yearlyKwh.toFixed(2)} kWh`;
            document.getElementById('res-yearly-cost').textContent = `$${yearlyCost.toFixed(2)} AUD`;

            // Reveal Results
            resultsPanel.classList.remove('hidden');
        });
    }

    function showError(elementId, message) {
        const errorEl = document.getElementById(elementId);
        if (errorEl) errorEl.textContent = message;
    }

    function clearError(elementId) {
        const errorEl = document.getElementById(elementId);
        if (errorEl) errorEl.textContent = '';
    }

    function clearAllErrors() {
        document.querySelectorAll('.error-msg').forEach(el => el.textContent = '');
    }
});