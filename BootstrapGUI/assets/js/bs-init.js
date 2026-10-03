
if (window.innerWidth < 768) {
	[].slice.call(document.querySelectorAll('[data-bss-disabled-mobile]')).forEach(function (elem) {
		elem.classList.remove('animated');
		elem.removeAttribute('data-bss-hover-animate');
		elem.removeAttribute('data-aos');
		elem.removeAttribute('data-bss-parallax-bg');
		elem.removeAttribute('data-bss-scroll-zoom');
	});
}

document.addEventListener('DOMContentLoaded', function() {

	var hoverAnimationTriggerList = [].slice.call(document.querySelectorAll('[data-bss-hover-animate]'));
	var hoverAnimationList = hoverAnimationTriggerList.forEach(function (hoverAnimationEl) {
		hoverAnimationEl.addEventListener('mouseenter', function(e){ e.target.classList.add('animated', e.target.dataset.bssHoverAnimate) });
		hoverAnimationEl.addEventListener('mouseleave', function(e){ e.target.classList.remove('animated', e.target.dataset.bssHoverAnimate) });
	});

	// Keep the header's logo region exactly as wide as the left nav rail so the
	// animated logo stays centered over the left column and the action buttons
	// (Start/F1 first) begin flush with the content pane's left edge. The rail
	// width is content-driven, so mirror it and re-sync whenever it changes.
	var sidebarRail = document.getElementById('sidebar-tabitems');
	var headerLogoRegion = document.getElementById('header-logo-region');
	var syncHeaderToSidebar = function () {
		if (!sidebarRail || !headerLogoRegion) return;
		var railWidth = sidebarRail.offsetWidth;
		if (railWidth > 0) {
			headerLogoRegion.style.width = railWidth + 'px';
		}
	};
	syncHeaderToSidebar();
	window.addEventListener('resize', syncHeaderToSidebar);
	if (window.ResizeObserver && sidebarRail) {
		new ResizeObserver(syncHeaderToSidebar).observe(sidebarRail);
	}
}, false);