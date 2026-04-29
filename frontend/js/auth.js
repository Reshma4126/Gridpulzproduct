// ============================================================
// GridPulz — Authentication Handler
// ============================================================
// Handles operator signup form submission, auth creation,
// and stations table insertion using Supabase client from CDN.
// ============================================================

function sanitizeEmail(value) {
    return String(value || '')
        .trim()
        .replace(/^"+|"+$/g, '')
        .toLowerCase();
}

// Backend URL configured in api-config.js

/**
 * Handle Operator Signup Form Submission
 */
async function handleOperatorSignup(event) {
    event.preventDefault();

    const form = event.target?.closest('form') || document.getElementById('signup-operator');
    if (!form) {
        alert('Operator signup form is not available on this page.');
        return;
    }

    function readValue(selector) {
        const field = form.querySelector(selector) || document.querySelector(selector);
        if (!field) {
            throw new Error(`Missing required field: ${selector}`);
        }
        return String(field.value ?? '');
    }

    const submitButton = form.querySelector('button[type="submit"]');
    const originalButtonText = submitButton ? submitButton.innerHTML : '';
    const email = sanitizeEmail(readValue('#email'));
    const password = readValue('#password');
    const name = readValue('#name').trim();
    const contact = readValue('#contact').trim();
    const address = readValue('#address').trim();
    const latitude = parseFloat(readValue('#latitude'));
    const longitude = parseFloat(readValue('#longitude'));
    const num_plugs = parseInt(readValue('#num_plugs'), 10);
    const charging_type = readValue('#charging_type').trim();
    const connector_type = readValue('#connector_type').trim();
    const total_capacity_kv = parseFloat(readValue('#total_capacity_kv'));
    const voltage = parseFloat(readValue('#voltage'));
    const max_current = parseFloat(readValue('#max_current'));
    const meter_available = readValue('#meter_available') === 'true';
    const communication_type = readValue('#communication_type').trim();
    const operating_hours = readValue('#operating_hours').trim();
    const avg_usage = parseFloat(readValue('#avg_usage'));

    try {
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.innerHTML = 'Establishing...';
        }

        // First try sign-in: if account already exists with this password, we continue directly.
        let { error: signInError } = await supabaseClient.auth.signInWithPassword({
            email,
            password,
        });

        if (signInError) {
            // No valid session yet; try creating account.
            const { error: authError } = await supabaseClient.auth.signUp({
                email,
                password,
                options: {
                    data: { role: 'operator' }
                }
            });

            if (authError) {
                const authMessage = String(authError.message || '');
                const alreadyRegistered = authMessage.toLowerCase().includes('already registered');

                if (alreadyRegistered) {
                    alert('This operator email already exists. Use the existing password to establish/update the node.');
                    return;
                }

                console.error('Auth signup error:', authError);
                alert('Signup failed: ' + authMessage);
                return;
            }

            // New account created, now authenticate to continue station setup.
            ({ error: signInError } = await supabaseClient.auth.signInWithPassword({
                email,
                password,
            }));

            if (signInError) {
                console.error('Post-signup signin error:', signInError);
                alert('Account created, but login is required before station setup. ' + signInError.message);
                return;
            }
        }

        const stationPayload = {
            email,
            name,
            contact,
            address,
            latitude,
            longitude,
            num_plugs,
            charging_type,
            connector_type,
            total_capacity_kw: total_capacity_kv,
            voltage,
            max_current,
            meter_available,
            communication_type,
            operating_hours,
            avg_usage
        };

        const response = await fetch(`${BACKEND_BASE_URL}/api/register-station`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(stationPayload)
        });

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            const message = errorBody.detail || `HTTP ${response.status}`;
            console.error('Station registration error:', message);
            if (response.status === 500 && String(message).toLowerCase().includes('supabase_service_role_key')) {
                alert('Station registration needs SUPABASE_SERVICE_ROLE_KEY on the backend, or a Supabase INSERT policy for stations.');
                return;
            }
            alert('Station registration failed: ' + message);
            return;
        }

            localStorage.setItem('gridpulz_operator_email', email);
        alert('Station registered successfully! Redirecting to your station dashboard.');
        window.location.href = 'dashboard.html';
    } catch (error) {
        console.error('Operator signup error:', error);
        const errMsg = String(error?.message || 'Unknown error');
        if (errMsg.toLowerCase().includes('failed to fetch')) {
            alert('Registration error: Backend is unreachable at http://127.0.0.1:8000. Start the API server using run_backend.bat and try again.');
        } else {
            alert('Registration error: ' + errMsg);
        }
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = originalButtonText || 'Establish Node';
        }
    }
}

// --- SMART LOGIN (Handles Both Roles) ---
async function handleLogin(event) {
    event.preventDefault();

    const email = sanitizeEmail(document.getElementById('login-email').value);
    const password = document.getElementById('login-password').value;

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) throw error;

        const userRole = data.user.user_metadata?.role;
        const selectedRole = window.currentRole; // 'operator' or 'user'

        if (userRole && userRole !== selectedRole) {
            await supabaseClient.auth.signOut();
            throw new Error(`Account mismatch: This is a ${userRole} account. Please use the correct tab to login.`);
        }

        const sessionEmail = sanitizeEmail(data.user?.email || email);

        if (selectedRole === 'operator') {
            localStorage.setItem('gridpulz_operator_email', sessionEmail);
            console.log('Operator detected. Routing to Command Center.');
            window.location.href = 'dashboard.html';
        } else {
            console.log('EV Driver detected. Routing to User Dashboard.');
            window.location.href = 'user-dashboard.html';
        }
    } catch (error) {
        console.error('Login Error:', error);
        alert('Login failed: ' + error.message);
    }
}

async function handleUserSignup(event) {
    event.preventDefault();

    const fullName = document.getElementById('fullName').value.trim();
    const email = sanitizeEmail(document.getElementById('email').value);
    const phone = document.getElementById('phone').value.trim() || null;
    const password = document.getElementById('password').value;
    const vehicleType = document.getElementById('vehicleType').value.trim() || null;
    const batteryCapacityValue = document.getElementById('batteryCapacity').value;
    const batteryCapacity = batteryCapacityValue ? Number(batteryCapacityValue) : null;
    const preferredChargingType = document.getElementById('preferredChargingType').value.trim() || null;
    const chargingPreferences = document.getElementById('chargingPreferences').value.trim() || null;

    try {
        const { error: authError } = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName,
                    role: 'user',
                    vehicle_name: vehicleType,
                    charging_capacity: batteryCapacity,
                    charging_type: preferredChargingType
                }
            }
        });

        if (authError) {
            console.error('User signup error:', authError);
            alert('Signup failed: ' + authError.message);
            return;
        }

        // Sign in immediately to create an authenticated session for the profile insert.
        const { error: signInError } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

        if (signInError) {
            console.error('Post-signup signin error:', signInError);
            alert('Account created, but auto-login failed. Please login manually. ' + signInError.message);
            window.location.href = 'login.html';
            return;
        }

        const { error: dbError } = await supabaseClient
            .from('users')
            .insert([{
                username: fullName,
                email: email,
                password: 'managed_by_supabase_auth',
                vehicle_name: vehicleType,
                charging_capacity: batteryCapacity,
                charging_type: preferredChargingType,
                voltage_type: null
            }]);

        if (dbError) {
            console.warn('Profile insert warning:', dbError.message);
        }

        alert('Registration successful! Please check your email to confirm your account, then login.');
        window.location.href = 'login.html';
    } catch (error) {
        console.error('User signup error:', error);
        alert('Registration failed: ' + error.message);
    }
}
