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


    //------ swipe controls -------
    // gets triggered when zooming on mobile >:(
    // carousel.addEventListener("touchstart", function(event) {
    //   touchstartX = event.touches[0].clientX;
    // });

    // carousel.addEventListener("touchend", function(event) {
    //   const touchendX = event.changedTouches[0].clientX;
    //   const deltaX = touchendX - touchstartX;
    //   const sensitivity = 100;
    //   if (deltaX > sensitivity) {
    //     prevSlide();
    //   } else if (deltaX < -sensitivity) {
    //     nextSlide();
    //   }
    // });

    showSlide(currentSlide);
    indicator.querySelector(".total-slides").textContent = slides.length;
  });
});






//--------- carousel hover arrows --------------
function updateCursorPosition(event) {
  const div = event.target;
  const rect = div.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;

  const customCursorLeft = document.getElementById("customCursorLeft");
  const customCursorRight = document.getElementById("customCursorRight");

  // Calculate the position of the mouse relative to the center of the div
  const distanceFromCenter = mouseX - div.offsetWidth / 2;

  if (distanceFromCenter < 0) {
    // Mouse is on the left half of the div
    customCursorLeft.style.display = "block";
    customCursorRight.style.display = "none";
  } else {
    // Mouse is on the right half of the div
    customCursorLeft.style.display = "none";
    customCursorRight.style.display = "block";
  }

  // Update the custom cursor positions
  customCursorLeft.style.left = event.clientX - customCursorLeft.width / 2 + "px";
  customCursorLeft.style.top = event.clientY - customCursorLeft.height / 2 + "px";
  customCursorRight.style.left = event.clientX - customCursorRight.width / 2 + "px";
  customCursorRight.style.top = event.clientY - customCursorRight.height / 2 + "px";
}

function hideCustomCursor() {
  const customCursorLeft = document.getElementById("customCursorLeft");
  const customCursorRight = document.getElementById("customCursorRight");
  customCursorLeft.style.display = "none";
  customCursorRight.style.display = "none";

}