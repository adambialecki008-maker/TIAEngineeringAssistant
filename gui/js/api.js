async function requestJson(
    url,
    options = {}
) {
    const response =
        await fetch(
            url,
            options
        );


    let data = null;


    try {
        data =
            await response.json();

    } catch {
        data = null;
    }


    if (!response.ok) {
        throw new Error(
            getErrorMessage(
                data,
                response.status
            )
        );
    }


    return data;
}


export async function getJson(
    url
) {
    return requestJson(
        url
    );
}


export async function postJson(
    url,
    payload
) {
    return requestJson(
        url,
        {
            method: "POST",

            headers: {
                "Content-Type":
                    "application/json",
            },

            body:
                JSON.stringify(
                    payload
                ),
        }
    );
}


export async function patchJson(
    url,
    payload
) {
    return requestJson(
        url,
        {
            method: "PATCH",

            headers: {
                "Content-Type":
                    "application/json",
            },

            body:
                JSON.stringify(
                    payload
                ),
        }
    );
}


export async function deleteJson(
    url,
    payload
) {
    return requestJson(
        url,
        {
            method: "DELETE",

            headers: {
                "Content-Type":
                    "application/json",
            },

            body:
                JSON.stringify(
                    payload
                ),
        }
    );
}


function getErrorMessage(
    data,
    status
) {
    if (
        data
        &&
        typeof data.detail
        ===
        "string"
    ) {
        return data.detail;
    }


    if (data !== null) {
        return JSON.stringify(
            data
        );
    }


    return (
        `HTTP ${status}`
    );
}
