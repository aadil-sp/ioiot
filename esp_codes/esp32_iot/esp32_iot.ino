#include <M5Unified.h>
#include <BleMouse.h>

// Initialize the Bluetooth Mouse with a custom name
BleMouse bleMouse("M5Stick-Mouse", "M5Stack", 100);

// State Variables
bool invertX = false;
bool invertY = false;
bool isDragging = false;

// Function to update the screen display
void drawMenu() {
    M5.Display.fillScreen(BLACK);
    M5.Display.setCursor(0, 0);
    M5.Display.setTextColor(YELLOW);
    M5.Display.setTextSize(2);
    M5.Display.println(" BT MOUSE MODE");
    M5.Display.println("---------------");
    
    M5.Display.setTextColor(WHITE);
    M5.Display.printf("Inv X: %s\n", invertX ? "ON " : "OFF");
    M5.Display.printf("Inv Y: %s\n", invertY ? "ON " : "OFF");
    M5.Display.println("---------------");
    
    if (isDragging) {
        M5.Display.setTextColor(RED);
        M5.Display.println("STATUS: DRAGGING");
    } else {
        M5.Display.setTextColor(GREEN);
        M5.Display.println("STATUS: IDLE");
    }
    
    M5.Display.setTextSize(1);
    M5.Display.setCursor(0, 200);
    M5.Display.setTextColor(GRAY);
    M5.Display.println("B: Click | Long B: Invert");
}

void setup() {
    auto cfg = M5.config();
    M5.begin(cfg);
    
    // Set rotation for horizontal holding
    M5.Display.setRotation(1);
    
    // Start Bluetooth Mouse
    bleMouse.begin();
    
    drawMenu();
}

void loop() {
    M5.update(); // Monitors button states and IMU

    // 1. HANDLE MOUSE MOVEMENT (GYRO)
    if (M5.Imu.update()) {
        float gx, gy, gz;
        M5.Imu.getGyroData(&gx, &gy, &gz);

        // Sensitivity: Divide by 15 (Increase for slower, decrease for faster)
        // Adjust axes based on how you hold the stick
        int8_t moveX = (gz / 15.0) * (invertX ? -1 : 1); 
        int8_t moveY = (gy / 15.0) * (invertY ? -1 : 1);

        // Deadzone to prevent "drifting" while still
        if (abs(moveX) < 1) moveX = 0;
        if (abs(moveY) < 1) moveY = 0;

        if (bleMouse.isConnected()) {
            bleMouse.move(moveX, moveY);
        }
    }

    // 2. BUTTON A (Front Big Button) - Click and Hold / Drag
    if (M5.BtnA.wasPressed()) {
        isDragging = true;
        bleMouse.press(MOUSE_LEFT);
        drawMenu();
    }
    if (M5.BtnA.wasReleased()) {
        isDragging = false;
        bleMouse.release(MOUSE_LEFT);
        drawMenu();
    }

    // 3. BUTTON B (Side Button) - Click or Invert Toggle
    if (M5.BtnB.wasClicked()) {
        bleMouse.click(MOUSE_LEFT);
    }

    // Toggle Inversion if B is held for more than 700ms
    if (M5.BtnB.pressedFor(700)) {
        invertX = !invertX;
        invertY = !invertY;
        drawMenu();
        // Wait until button is released so it doesn't flip-flop
        while(M5.BtnB.isPressed()) { M5.update(); delay(10); }
    }

    delay(10); // 100Hz Polling rate
}