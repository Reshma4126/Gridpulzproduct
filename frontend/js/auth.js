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

/**
 * Handle Operator Signup Form Submission
 */
async function handleOperatorSignup(event) {
    event.preventDefault();

    const form = event.target;
    const email = sanitizeEmail(form.querySelector('#email').value);
    const password = form.querySelector('#password').value;
    const name = form.querySelector('#name').value.trim();
    const contact = form.querySelector('#contact').value.trim();
    const station_email = sanitizeEmail(form.querySelector('#station_email').value);
    const address = form.querySelector('#address').value.trim();
    const latitude = parseFloat(form.querySelector('#latitude').value);
    const longitude = parseFloat(form.querySelector('#longitude').value);
    const num_plugs = parseInt(form.querySelector('#num_plugs').value, 10);
    const charging_type = form.querySelector('#charging_type').value.trim();
    const connector_type = form.querySelector('#connector_type').value.trim();
    const total_capacity_kv = parseFloat(form.querySelector('#total_capacity_kv').value);
    const voltage = parseFloat(form.querySelector('#voltage').value);
    const max_current = parseFloat(form.querySelector('#max_current').value);
    const meter_available = form.querySelector('#meter_available').value === 'true';
    const communication_type = form.querySelector('#communication_type').value.trim();
    const operating_hours = form.querySelector('#operating_hours').value.trim();
    const avg_usage = parseFloat(form.querySelector('#avg_usage').value);

    try {
        const { error: authError } = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
                data: {
                    role: 'operator'
                }
            }
        });

        if (authError) {
            console.error('Auth signup error:', authError);
            alert('Signup failed: ' + authError.message);
            return;
        }

        // Ensure we have an authenticated session before inserting into RLS-protected tables.
        const { error: signInError } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

        if (signInError) {
            console.error('Post-signup signin error:', signInError);
            alert('Account created, but login is required before station setup. ' + signInError.message);
            return;
        }

        // Try supported capacity column names across schema variants.
        const basePayload = {
            name,
            contact,
            email: station_email,
            address,
            latitude,
            longitude,
            num_plugs,
            charging_type,
            connector_type,
            voltage,
            max_current,
            meter_available,
            operating_hours,
            avg_usage
        };

        const payloads = [
            { ...basePayload, total_capacity_kv: total_capacity_kv, communication_t: communication_type },
            { ...basePayload, total_capacity_kw: total_capacity_kv, communication_t: communication_type },
            { ...basePayload, power_capacity_kw: total_capacity_kv, communication_t: communication_type },
            { ...basePayload, total_capacity_kv: total_capacity_kv, communication_type: communication_type },
            { ...basePayload, total_capacity_kw: total_capacity_kv, communication_type: communication_type },
            { ...basePayload, power_capacity_kw: total_capacity_kv, communication_type: communication_type },
            { ...basePayload }
        ];

        let dbError = null;
        for (const payload of payloads) {
            const { error } = await supabaseClient.from('stations').insert([payload]);
            if (!error) {
                dbError = null;
                break;
            }

            // Ignore only missing-column errors and try next payload variant.
            if (error.code === 'PGRST204') {
                dbError = error;
                continue;
            }

            dbError = error;
            break;
        }

        if (dbError) {
            console.error('Database insert error:', dbError);
            if (dbError.code === '42501') {
                alert('Station registration failed due database policy (RLS). Allow authenticated INSERT on stations in Supabase policies.');
                return;
            }
            alert('Station registration failed: ' + dbError.message);
            return;
        }

        alert('Station registered successfully!');
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Operator signup error:', error);
        alert('Registration error: ' + error.message);
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

        const role = data.user.user_metadata?.role || window.currentRole;

        if (role === 'operator') {
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
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
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

        // Sign in immediately to get an authenticated session for RLS-protected insert.
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
