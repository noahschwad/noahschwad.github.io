document.addEventListener("DOMContentLoaded", function() {
  const carousels = document.querySelectorAll(".carousel");

  carousels.forEach(function(carousel) {
    const container = carousel.querySelector(".carousel-container");
    const slides = container.getElementsByClassName("slide");
    const indicator = carousel.parentNode.querySelector(".carousel-indicator");
    let currentSlide = 0;
    let touchstartX = 0;

    function showSlide(index) {
      container.style.transform = `translateX(-${index * 100}%)`;
      indicator.querySelector(".current-slide").textContent = index + 1;
    }

    function animateSlide() {
      container.classList.add("slide-animation");
      setTimeout(function() {
        container.classList.remove("slide-animation");
      }, 500); // Adjust the duration (in milliseconds) to match your transition duration
    }

    function nextSlide() {
      currentSlide = (currentSlide + 1) % slides.length;
      animateSlide();
      showSlide(currentSlide);
    }

    function prevSlide() {
      currentSlide = (currentSlide - 1 + slides.length) % slides.length;
      animateSlide();
      showSlide(currentSlide);
    }

    carousel.addEventListener("click", function(event) {
      const clickX = event.clientX - event.target.getBoundingClientRect().left;
      const halfWidth = event.target.offsetWidth / 2;
      if (clickX > halfWidth) {
        nextSlide();
      } else {
        prevSlide();
      }
    });

    carousel.addEventListener("touchstart", function(event) {
      touchstartX = event.touches[0].clientX;
    });

    carousel.addEventListener("touchend", function(event) {
      const touchendX = event.changedTouches[0].clientX;
      const deltaX = touchendX - touchstartX;
      const sensitivity = 100;
      if (deltaX > sensitivity) {
        prevSlide();
      } else if (deltaX < -sensitivity) {
        nextSlide();
      }
    });

    showSlide(currentSlide);
    indicator.querySelector(".total-slides").textContent = slides.length;
  });
});
